import { NextResponse, type NextRequest } from "next/server";

const READING_XP = 10;

type FirestoreFields = Record<
  string,
  { booleanValue?: boolean; integerValue?: string }
>;

type FirestoreDocument = {
  name: string;
  fields?: FirestoreFields;
};

const isDocumentId = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && !value.includes("/");

const firestoreValue = (document: FirestoreDocument | undefined, field: string) =>
  document?.fields?.[field];

const integerField = (document: FirestoreDocument | undefined, field: string) => {
  const value = firestoreValue(document, field)?.integerValue;
  return value === undefined ? 0 : Number.parseInt(value, 10) || 0;
};

async function getAuthenticatedUid(idToken: string, apiKey: string) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    },
  );

  if (!response.ok) return null;

  const body = (await response.json()) as { users?: Array<{ localId?: string }> };
  return body.users?.[0]?.localId ?? null;
}

async function transactionDocuments(
  projectId: string,
  idToken: string,
  transaction: string,
  names: string[],
) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:batchGet`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ documents: names, transaction }),
    },
  );

  if (!response.ok) throw new Error("Unable to read activity data");

  // batchGet is streamed as newline-delimited JSON by the Firestore REST API.
  const documents = new Map<string, FirestoreDocument>();
  for (const line of (await response.text()).split("\n")) {
    if (!line) continue;
    const result = JSON.parse(line) as { found?: FirestoreDocument };
    if (result.found) documents.set(result.found.name, result.found);
  }
  return documents;
}

/** Records a completed chapter and awards its one-time 10 XP reading bonus. */
export async function POST(request: NextRequest) {
  const idToken = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/i)?.[1];
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

  if (!idToken) {
    return NextResponse.json({ error: "Missing authorization token" }, { status: 401 });
  }
  if (!projectId || !apiKey) {
    return NextResponse.json({ error: "Firebase is not configured" }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as {
    subject?: unknown;
    unitId?: unknown;
    chapterId?: unknown;
  } | null;
  const { subject, unitId, chapterId } = body ?? {};
  if (!isDocumentId(subject) || !isDocumentId(unitId) || !isDocumentId(chapterId)) {
    return NextResponse.json(
      { error: "subject, unitId, and chapterId must be valid document IDs" },
      { status: 400 },
    );
  }

  const uid = await getAuthenticatedUid(idToken, apiKey);
  if (!uid) {
    return NextResponse.json({ error: "Invalid authorization token" }, { status: 401 });
  }

  const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const chapterPath = `subjects/${encodeURIComponent(subject)}/units/${encodeURIComponent(unitId)}/chapters/${encodeURIComponent(chapterId)}`;
  const chapterResponse = await fetch(`${baseUrl}/${chapterPath}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (chapterResponse.status === 404) {
    return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
  }
  if (!chapterResponse.ok) {
    return NextResponse.json({ error: "Not authorized to access this chapter" }, { status: 403 });
  }

  const beginResponse = await fetch(`${baseUrl}:beginTransaction`, {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!beginResponse.ok) {
    return NextResponse.json({ error: "Unable to begin activity transaction" }, { status: 500 });
  }
  const { transaction } = (await beginResponse.json()) as { transaction?: string };
  if (!transaction) {
    return NextResponse.json({ error: "Unable to begin activity transaction" }, { status: 500 });
  }

  const userName = `projects/${projectId}/databases/(default)/documents/users/${uid}`;
  const chapterDataName = `${userName}/chapterData/${chapterId}`;

  try {
    const documents = await transactionDocuments(projectId, idToken, transaction, [
      userName,
      chapterDataName,
    ]);
    const user = documents.get(userName);
    const chapterData = documents.get(chapterDataName);
    const totalXp = integerField(user, "xp");

    if (firestoreValue(chapterData, "readingXpAwarded")?.booleanValue === true) {
      return NextResponse.json({ xpAwarded: 0, totalXp, alreadyRecorded: true });
    }

    const commitResponse = await fetch(`${baseUrl}:commit`, {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        transaction,
        writes: [
          {
            update: {
              name: chapterDataName,
              fields: {
                progress: { stringValue: "Complete" },
                readingXpAwarded: { booleanValue: true },
              },
            },
            updateMask: { fieldPaths: ["progress", "readingXpAwarded"] },
            updateTransforms: [
              { fieldPath: "completedAt", setToServerValue: "REQUEST_TIME" },
            ],
          },
          {
            transform: {
              document: userName,
              fieldTransforms: [
                { fieldPath: "xp", increment: { integerValue: String(READING_XP) } },
              ],
            },
          },
        ],
      }),
    });

    if (!commitResponse.ok) {
      return NextResponse.json({ error: "Unable to record completed reading" }, { status: 500 });
    }

    return NextResponse.json({
      xpAwarded: READING_XP,
      totalXp: totalXp + READING_XP,
      alreadyRecorded: false,
    });
  } catch {
    return NextResponse.json({ error: "Unable to record completed reading" }, { status: 500 });
  }
}

import { NextResponse, type NextRequest } from "next/server";

// Keep the base award aligned with a completed reading. Every correctly
// answered gradable question earns this amount again.
const BASE_TEST_XP = 10;
const CORRECT_ANSWER_XP = 10;

type FirestoreValue = {
  stringValue?: string;
  booleanValue?: boolean;
  integerValue?: string;
  arrayValue?: { values?: FirestoreValue[] };
  mapValue?: { fields?: Record<string, FirestoreValue> };
};

type FirestoreDocument = {
  name: string;
  fields?: Record<string, FirestoreValue>;
};

type SubmittedAnswers = Record<number, string[]>;

const isDocumentId = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && !value.includes("/");

const integerField = (document: FirestoreDocument | undefined, field: string) => {
  const value = document?.fields?.[field]?.integerValue;
  return value === undefined ? 0 : Number.parseInt(value, 10) || 0;
};

const stringArray = (value: FirestoreValue | undefined) =>
  (value?.arrayValue?.values ?? [])
    .map((entry) => entry.stringValue)
    .filter((entry): entry is string => typeof entry === "string");

const sameOptionIds = (submitted: string[], official: string[]) => {
  const submittedIds = new Set(submitted);
  const officialIds = new Set(official);
  return (
    submittedIds.size === submitted.length &&
    submittedIds.size === officialIds.size &&
    [...submittedIds].every((id) => officialIds.has(id))
  );
};

function parseAnswers(value: unknown): SubmittedAnswers | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const result: SubmittedAnswers = {};
  for (const [index, answerIds] of Object.entries(value)) {
    if (!/^\d+$/.test(index) || !Array.isArray(answerIds)) return null;
    const parsedAnswerIds: string[] = [];
    for (const answerId of answerIds) {
      if (typeof answerId !== "string" || answerId.length === 0) return null;
      parsedAnswerIds.push(answerId);
    }
    result[Number(index)] = parsedAnswerIds;
  }
  return result;
}

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
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ documents: names, transaction }),
    },
  );
  if (!response.ok) throw new Error("Unable to read activity data");

  const documents = new Map<string, FirestoreDocument>();
  for (const line of (await response.text()).split("\n")) {
    if (!line) continue;
    const result = JSON.parse(line) as { found?: FirestoreDocument };
    if (result.found) documents.set(result.found.name, result.found);
  }
  return documents;
}

/** Grades a published MCQ test on the server and awards its one-time XP. */
export async function POST(request: NextRequest) {
  const idToken = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!idToken) return NextResponse.json({ error: "Missing authorization token" }, { status: 401 });
  if (!projectId || !apiKey) return NextResponse.json({ error: "Firebase is not configured" }, { status: 500 });

  const body = (await request.json().catch(() => null)) as {
    subject?: unknown;
    unitId?: unknown;
    testId?: unknown;
    answers?: unknown;
  } | null;
  const { subject, unitId, testId } = body ?? {};
  const answers = parseAnswers(body?.answers);
  if (!isDocumentId(subject) || !isDocumentId(unitId) || !isDocumentId(testId) || !answers) {
    return NextResponse.json(
      { error: "subject, unitId, testId, and answers must be valid" },
      { status: 400 },
    );
  }

  const uid = await getAuthenticatedUid(idToken, apiKey);
  if (!uid) return NextResponse.json({ error: "Invalid authorization token" }, { status: 401 });

  const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const testPath = `subjects/${encodeURIComponent(subject)}/units/${encodeURIComponent(unitId)}/tests/${encodeURIComponent(testId)}`;
  const testResponse = await fetch(`${baseUrl}/${testPath}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (testResponse.status === 404) return NextResponse.json({ error: "Test not found" }, { status: 404 });
  if (!testResponse.ok) return NextResponse.json({ error: "Not authorized to access this test" }, { status: 403 });

  const test = (await testResponse.json()) as FirestoreDocument;
  const questions = test.fields?.questions?.arrayValue?.values ?? [];
  const gradedQuestions = questions.map((question, index) => {
    const fields = question.mapValue?.fields;
    const type = fields?.type?.stringValue;
    const officialAnswers = stringArray(fields?.answers);
    const gradable = (type === "mcq" || type === "multi-answer") && officialAnswers.length > 0;
    return gradable && sameOptionIds(answers[index] ?? [], officialAnswers);
  });
  const total = gradedQuestions.filter((_, index) => {
    const fields = questions[index]?.mapValue?.fields;
    return (fields?.type?.stringValue === "mcq" || fields?.type?.stringValue === "multi-answer") && stringArray(fields?.answers).length > 0;
  }).length;
  if (total === 0) return NextResponse.json({ error: "Test has no gradable questions" }, { status: 400 });

  const correct = gradedQuestions.filter(Boolean).length;
  const xpAwarded = BASE_TEST_XP + correct * CORRECT_ANSWER_XP;
  const beginResponse = await fetch(`${baseUrl}:beginTransaction`, {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!beginResponse.ok) return NextResponse.json({ error: "Unable to begin activity transaction" }, { status: 500 });
  const { transaction } = (await beginResponse.json()) as { transaction?: string };
  if (!transaction) return NextResponse.json({ error: "Unable to begin activity transaction" }, { status: 500 });

  const userName = `projects/${projectId}/databases/(default)/documents/users/${uid}`;
  const testDataName = `${userName}/testData/${testId}`;
  try {
    const documents = await transactionDocuments(projectId, idToken, transaction, [userName, testDataName]);
    const totalXp = integerField(documents.get(userName), "xp");
    const existingAttempt = documents.get(testDataName);
    if (existingAttempt?.fields?.xpAwarded?.booleanValue === true) {
      return NextResponse.json({
        xpAwarded: 0,
        totalXp,
        correct: integerField(existingAttempt, "correct"),
        total: integerField(existingAttempt, "total"),
        alreadyRecorded: true,
      });
    }

    const commitResponse = await fetch(`${baseUrl}:commit`, {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        transaction,
        writes: [
          {
            update: {
              name: testDataName,
              fields: {
                subject: { stringValue: subject },
                unitId: { stringValue: unitId },
                correct: { integerValue: String(correct) },
                total: { integerValue: String(total) },
                xpAwarded: { booleanValue: true },
              },
            },
            updateMask: { fieldPaths: ["subject", "unitId", "correct", "total", "xpAwarded"] },
            updateTransforms: [{ fieldPath: "completedAt", setToServerValue: "REQUEST_TIME" }],
          },
          {
            transform: {
              document: userName,
              fieldTransforms: [{ fieldPath: "xp", increment: { integerValue: String(xpAwarded) } }],
            },
          },
        ],
      }),
    });
    if (!commitResponse.ok) return NextResponse.json({ error: "Unable to record completed test" }, { status: 500 });
    return NextResponse.json({ xpAwarded, totalXp: totalXp + xpAwarded, correct, total, alreadyRecorded: false });
  } catch {
    return NextResponse.json({ error: "Unable to record completed test" }, { status: 500 });
  }
}

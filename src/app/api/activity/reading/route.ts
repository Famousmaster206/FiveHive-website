import {
  cert,
  getApps,
  initializeApp,
  type ServiceAccount,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

const READING_XP = 10;
const ADMIN_APP_NAME = "activity";
const PRIVILEGED_ACCESS = ["admin", "member", "grader"];

const isDocumentId = (value: unknown): value is string =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  !value.includes("/") &&
  value !== "." &&
  value !== "..";

/**
 * Awarding XP has to happen with credentials the reader does not have:
 * writing as the reader would leave them free to grant themselves the bonus
 * directly, or to clear the flag that makes it one-time.
 */
function adminServices() {
  const existing = getApps().find((app) => app.name === ADMIN_APP_NAME);
  if (existing) return { auth: getAuth(existing), db: getFirestore(existing) };

  // Hosts mangle multi-line secrets, so base64 is accepted alongside raw JSON.
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!key) return null;
  const json = key.trim().startsWith("{")
    ? key
    : Buffer.from(key, "base64").toString("utf8");

  try {
    const app = initializeApp(
      {
        credential: cert(JSON.parse(json) as ServiceAccount),
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      },
      ADMIN_APP_NAME,
    );
    return { auth: getAuth(app), db: getFirestore(app) };
  } catch (error) {
    console.error("Unable to initialize the Firebase Admin SDK:", error);
    return null;
  }
}

/** Records a completed chapter and awards its one-time 10 XP reading bonus. */
export async function POST(request: NextRequest) {
  const idToken = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/i)?.[1];

  if (!idToken) {
    return NextResponse.json(
      { error: "Missing authorization token" },
      { status: 401 },
    );
  }

  const admin = adminServices();
  if (!admin) {
    return NextResponse.json(
      { error: "Firebase is not configured" },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    subject?: unknown;
    unitId?: unknown;
    chapterId?: unknown;
  } | null;
  const { subject, unitId, chapterId } = body ?? {};
  if (
    !isDocumentId(subject) ||
    !isDocumentId(unitId) ||
    !isDocumentId(chapterId)
  ) {
    return NextResponse.json(
      { error: "subject, unitId, and chapterId must be valid document IDs" },
      { status: 400 },
    );
  }

  // `true` rejects tokens whose session has been revoked, so the token is only
  // ever proof of identity here and never a Firestore credential.
  const decoded = await admin.auth
    .verifyIdToken(idToken, true)
    .catch(() => null);
  if (!decoded) {
    return NextResponse.json(
      { error: "Invalid authorization token" },
      { status: 401 },
    );
  }

  const userRef = admin.db.doc(`users/${decoded.uid}`);
  const chapterDataRef = userRef.collection("chapterData").doc(chapterId);
  const chapterRef = admin.db.doc(
    `subjects/${subject}/units/${unitId}/chapters/${chapterId}`,
  );

  try {
    const [chapter, user] = await Promise.all([
      chapterRef.get(),
      userRef.get(),
    ]);
    if (!chapter.exists) {
      return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
    }

    // Admin credentials ignore security rules, so the reader's own access to
    // the chapter is checked here the way `firestore.rules` would.
    const access = user.get("access") as unknown;
    if (!user.exists || access === "banned") {
      return NextResponse.json(
        { error: "Not authorized to earn XP" },
        { status: 403 },
      );
    }
    if (
      chapter.get("isPublic") !== true &&
      !PRIVILEGED_ACCESS.includes(String(access))
    ) {
      return NextResponse.json(
        { error: "Not authorized to access this chapter" },
        { status: 403 },
      );
    }

    const award = await admin.db.runTransaction(async (transaction) => {
      const userDocument = await transaction.get(userRef);
      const chapterData = await transaction.get(chapterDataRef);
      const totalXp = Number(userDocument.get("xp")) || 0;

      if (chapterData.get("readingXpAwarded") === true) {
        return { xpAwarded: 0, totalXp, alreadyRecorded: true };
      }

      transaction.set(
        chapterDataRef,
        {
          progress: "Complete",
          readingXpAwarded: true,
          completedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      transaction.set(
        userRef,
        { xp: FieldValue.increment(READING_XP) },
        { merge: true },
      );

      return {
        xpAwarded: READING_XP,
        totalXp: totalXp + READING_XP,
        alreadyRecorded: false,
      };
    });

    return NextResponse.json(award);
  } catch (error) {
    console.error("Unable to record completed reading:", error);
    return NextResponse.json(
      { error: "Unable to record completed reading" },
      { status: 500 },
    );
  }
}

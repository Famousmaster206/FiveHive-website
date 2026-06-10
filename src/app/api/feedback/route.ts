import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { getAuth } from "firebase-admin/auth";
import type { FeedbackSubmission } from "@/types/feedback";

async function requireAdmin(request: Request) {
  const header = request.headers.get("authorization");
  const token = header?.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const decoded = await getAuth().verifyIdToken(token);
  const userDoc = await adminDb.collection("users").doc(decoded.uid).get();
  return userDoc.data()?.access === "admin";
}

export async function GET(request: Request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const snapshot = await adminDb
    .collection("feedbackSubmissions")
    .orderBy("submittedAt", "desc")
    .get();

  return NextResponse.json(
    snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
  );
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<FeedbackSubmission> & {
    idToken?: string;
  };

  const authHeader = request.headers.get("authorization");
  const token = body.idToken ?? authHeader?.replace(/^Bearer\s+/i, "");
  let submittedBy: string | null = null;
  if (token) {
    try {
      const decoded = await getAuth().verifyIdToken(token);
      submittedBy = decoded.uid;
    } catch {
      submittedBy = null;
    }
  }

  const docRef = adminDb.collection("feedbackSubmissions").doc();
  await docRef.set({
    contact: body.contact ?? "",
    type: body.type ?? "feedback",
    bugType: body.bugType ?? null,
    bugUrl: body.bugUrl ?? "",
    description: body.description ?? "",
    editorData: body.editorData ?? null,
    imageUrls: body.imageUrls ?? [],
    images: body.images ?? [],
    pageUrl: body.pageUrl ?? "",
    userAgent: body.userAgent ?? request.headers.get("user-agent") ?? "",
    status: "pending",
    submittedAt: Timestamp.now(),
    submittedBy,
    submitterEmail: body.submitterEmail ?? null,
    submitterDiscord: body.submitterDiscord ?? null,
    reviewedAt: null,
    reviewedBy: null,
    githubIssueUrl: null,
    githubIssueNumber: null,
    adminNotes: "",
    rejectionReason: "",
  });

  return NextResponse.json({ id: docRef.id, status: "pending" }, { status: 201 });
}

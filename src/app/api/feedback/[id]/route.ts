import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { feedbackToMarkdown } from "@/lib/feedback";
import { getAuth } from "firebase-admin/auth";

async function requireAdmin(request: Request) {
  const header = request.headers.get("authorization");
  const token = header?.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const decoded = await getAuth().verifyIdToken(token);
  const userDoc = await adminDb.collection("users").doc(decoded.uid).get();
  return userDoc.data()?.access === "admin";
}

async function createGithubIssue(submission: Record<string, unknown>, issueBody: string) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) {
    throw new Error("Missing GITHUB_TOKEN or GITHUB_REPOSITORY");
  }

  const labels = new Set<string>();
  if (submission.type === "bug") labels.add("Bug");
  if (submission.type === "feedback") labels.add("Feedback");
  if (submission.type === "question") labels.add("Question");
  if (submission.bugType === "unit-test-errors") labels.add("unit-tests");
  if (submission.bugType === "website-bugs") labels.add("frontend/bug");
  if (submission.bugType === "article-errors") labels.add("article-errors");
  if (submission.bugType === "mock-exam-errors") labels.add("mock-exam-errors");

  const response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      title: `${String(submission.type).toUpperCase()}: ${String(submission.description).slice(0, 80)}`,
      body: issueBody,
      labels: Array.from(labels),
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub issue creation failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as { html_url: string; number: number };
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = params;
  const body = (await request.json()) as {
    action?: "approve" | "reject";
    adminNotes?: string;
    rejectionReason?: string;
  };

  const ref = adminDb.collection("feedbackSubmissions").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const submission = snap.data() as Record<string, unknown>;
  const update: Record<string, unknown> = {
    reviewedAt: Timestamp.now(),
    adminNotes: body.adminNotes ?? "",
  };

  if (body.action === "reject") {
    update.status = "rejected";
    update.rejectionReason = body.rejectionReason ?? "";
    await ref.update(update);
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  if (body.action === "approve") {
    const markdown = feedbackToMarkdown(submission as never);
    const issue = await createGithubIssue(submission, markdown);
    update.status = "approved";
    update.githubIssueUrl = issue.html_url;
    update.githubIssueNumber = issue.number;
    await ref.update(update);
    return NextResponse.json({ ok: true, status: "approved", issue });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

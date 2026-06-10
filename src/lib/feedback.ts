import type { FeedbackSubmission } from "@/types/feedback";

const escapeMarkdown = (value: string) =>
  value.replaceAll("[", "\\[").replaceAll("]", "\\]");

const extractText = (data: unknown): string => {
  if (!data || typeof data !== "object") return "";
  if ("text" in data && typeof (data as { text?: unknown }).text === "string") {
    return (data as { text: string }).text;
  }
  if ("caption" in data && typeof (data as { caption?: unknown }).caption === "string") {
    return (data as { caption: string }).caption;
  }
  return "";
};

export function feedbackToMarkdown(submission: Pick<FeedbackSubmission, "type" | "contact" | "description" | "bugType" | "bugUrl" | "images" | "pageUrl">) {
  const lines: string[] = [];
  lines.push(`## ${submission.type.toUpperCase()}`);
  lines.push("");
  if (submission.contact) lines.push(`**Contact:** ${escapeMarkdown(submission.contact)}`);
  if (submission.bugType) lines.push(`**Bug Type:** ${escapeMarkdown(submission.bugType)}`);
  if (submission.bugUrl) lines.push(`**URL:** ${escapeMarkdown(submission.bugUrl)}`);
  if (submission.pageUrl) lines.push(`**Page URL:** ${escapeMarkdown(submission.pageUrl)}`);
  lines.push("");
  lines.push(submission.description || "_No description provided_");
  lines.push("");

  for (const image of submission.images ?? []) {
    const caption = image.caption?.trim() || extractText(image) || "Submitted image";
    lines.push(`![${escapeMarkdown(caption)}](${image.url})`);
    lines.push("");
  }

  return lines.join("\n").trim();
}


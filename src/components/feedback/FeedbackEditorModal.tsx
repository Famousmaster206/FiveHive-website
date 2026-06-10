"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { auth } from "@/lib/firebase";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import { OutputData } from "@editorjs/editorjs";
import useEditor from "hooks/useEditor";
import Header from "@editorjs/header";
import Paragraph from "@editorjs/paragraph";
import List from "@editorjs/list";
import ImageTool from "@editorjs/image";

type Type = "bug" | "feedback" | "question";
type BugType = "article-errors" | "unit-test-errors" | "mock-exam-errors" | "website-bugs" | "other";

const BUG_LABELS: Record<BugType, string> = {
  "article-errors": "Website Article Errors",
  "unit-test-errors": "Unit Test Errors",
  "mock-exam-errors": "Mock Exam Errors",
  "website-bugs": "Website Bugs",
  other: "Other",
};

function EditorField({ onChange }: { onChange: (data: OutputData) => void }) {
  const { editor } = useEditor({
    holder: "feedback-editor",
    tools: {
      header: { class: Header as never, inlineToolbar: true },
      paragraph: { class: Paragraph as never, inlineToolbar: true },
      list: { class: List as never, inlineToolbar: true },
      image: {
        class: ImageTool as never,
        config: {
          uploader: {
            async uploadByFile(file: File) {
              const storage = getStorage();
              const storageRef = ref(storage, `feedback/${Date.now()}_${file.name}`);
              const snapshot = await uploadBytes(storageRef, file);
              const url = await getDownloadURL(snapshot.ref);
              return { success: 1, file: { url, storageRefFullPath: storageRef.fullPath } };
            },
          },
        },
      },
    },
    data: {
      time: Date.now(),
      blocks: [{ type: "paragraph", data: { text: "" } }],
      version: "2.30.2",
    },
    onChange: async (api) => {
      onChange(await api.saver.save());
    },
  });

  return <div id="feedback-editor" className="min-h-48 rounded-md border p-3" data-ready={!!editor} />;
}

export default function FeedbackEditorModal() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<Type>("bug");
  const [bugType, setBugType] = useState<BugType>("website-bugs");
  const [contact, setContact] = useState("");
  const [bugUrl, setBugUrl] = useState("");
  const [editorData, setEditorData] = useState<OutputData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const description = useMemo(
    () =>
      editorData?.blocks
        ?.map((block: any) => block.data?.text ?? block.data?.caption ?? "")
        .filter(Boolean)
        .join("\n") ?? "",
    [editorData],
  );

  useEffect(() => {
    if (!open) setSuccess(null);
  }, [open]);

  const submit = async () => {
    setSubmitting(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          type,
          bugType: type === "bug" ? bugType : undefined,
          bugUrl: type === "bug" ? bugUrl : undefined,
          contact,
          description,
          editorData,
          imageUrls: [],
          images: (editorData?.blocks ?? [])
            .filter((block: any) => block.type === "image")
            .map((block: any) => ({ url: block.data?.file?.url, caption: block.data?.caption, storageRefFullPath: block.data?.file?.storageRefFullPath })),
          pageUrl: window.location.href,
          userAgent: navigator.userAgent,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSuccess("Submitted. An admin will review it shortly.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="text-[#2E0F0FB2] hover:underline">Feedback</button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="contact">Contact</Label>
            <Input id="contact" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Discord username or email" />
          </div>
          <div className="grid gap-2">
            <Label>Type</Label>
            <select className="rounded-md border p-2" value={type} onChange={(e) => setType(e.target.value as Type)}>
              <option value="bug">Reporting a Bug</option>
              <option value="feedback">Providing Feedback</option>
              <option value="question">Asking Questions</option>
            </select>
          </div>
          {type === "bug" && (
            <>
              <div className="grid gap-2">
                <Label>Bug type</Label>
                <select className="rounded-md border p-2" value={bugType} onChange={(e) => setBugType(e.target.value as BugType)}>
                  {Object.entries(BUG_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bugUrl">URL</Label>
                <Input id="bugUrl" value={bugUrl} onChange={(e) => setBugUrl(e.target.value)} placeholder="URL of the issue or N/A" />
              </div>
            </>
          )}
          <div className="grid gap-2">
            <Label>Description</Label>
            <EditorField onChange={setEditorData} />
          </div>
          {success && <p className="rounded-md bg-green-50 p-3 text-sm text-green-800">{success}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={submitting}>{submitting ? "Submitting..." : "Submit"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";

type Item = {
  id: string;
  type: string;
  bugType?: string;
  contact?: string;
  description?: string;
  status: string;
  githubIssueUrl?: string;
};

export default function FeedbackQueue() {
  const [items, setItems] = useState<Item[]>([]);

  const load = async () => {
    const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
    const res = await fetch("/api/feedback", {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    setItems(await res.json());
  };

  useEffect(() => {
    void load();
  }, []);

  const act = async (id: string, action: "approve" | "reject") => {
    const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
    await fetch(`/api/feedback/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ action }),
    });
    await load();
  };

  return (
    <div className="mt-8 rounded-lg border p-4">
      <h2 className="mb-3 text-2xl font-bold">Feedback Review Queue</h2>
      <div className="grid gap-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{item.type} {item.bugType ? `• ${item.bugType}` : ""}</p>
                <p className="text-sm opacity-70">{item.contact}</p>
              </div>
              <span className="rounded bg-gray-100 px-2 py-1 text-xs">{item.status}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm">{item.description}</p>
            {item.githubIssueUrl && <a className="mt-2 block text-sm text-blue-600 underline" href={item.githubIssueUrl} target="_blank">Open GitHub issue</a>}
            <div className="mt-3 flex gap-2">
              <button className="rounded bg-green-600 px-3 py-1 text-white" onClick={() => act(item.id, "approve")}>Approve</button>
              <button className="rounded bg-red-600 px-3 py-1 text-white" onClick={() => act(item.id, "reject")}>Reject</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

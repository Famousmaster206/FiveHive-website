import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const retentionMs = 48 * 60 * 60 * 1000;

function loadHook(now: number) {
  const writes: { ref: string; data: Record<string, unknown> }[] = [];
  const states: unknown[] = [];
  let listener: (snapshot: unknown) => void = () => {};
  const output = ts.transpileModule(
    readFileSync(new URL("../src/components/hooks/useNotifications.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const modules: Record<string, unknown> = {
    react: {
      useState: (initial: unknown) => [initial, (value: unknown) => states.push(value)],
      useEffect: (callback: () => void) => callback(),
    },
    "firebase/firestore": {
      collection: (_db: unknown, path: string) => path,
      doc: (_db: unknown, path: string) => path,
      limit: () => {}, orderBy: () => {}, query: () => {},
      onSnapshot: (_query: unknown, callback: typeof listener) => { listener = callback; },
      serverTimestamp: () => "server-timestamp",
      Timestamp: { fromMillis: (millis: number) => ({ toMillis: () => millis }) },
      updateDoc: async (ref: string, data: Record<string, unknown>) => { writes.push({ ref, data }); },
    },
    "@/lib/firebase": { db: {} },
    "@/types/dashboard": {
      dashboardDocumentPaths: { notification: (uid: string, id: string) => `notifications/${uid}/items/${id}` },
    },
  };
  const exports: Record<string, unknown> = {};
  runInNewContext(output, {
    exports, console, Date: { now: () => now },
    require: (name: string) => { assert.ok(name in modules, name); return modules[name]; },
  });
  return {
    hook: exports.useNotifications as (uid?: string) => { markRead: (id: string) => Promise<void> },
    writes, states,
    snapshot: (docs: unknown[]) => listener({ docs }),
  };
}

test("acknowledging sets server read time and browser expiry 48 hours later together", async () => {
  const now = Date.UTC(2026, 9, 20, 12);
  const { hook, writes } = loadHook(now);
  await hook("student").markRead("notice");
  assert.equal(writes.length, 1);
  const write = writes[0]!;
  assert.equal(write.ref, "notifications/student/items/notice");
  assert.equal(write.data.readAt, "server-timestamp");
  const expiry = write.data.expiresAt as { toMillis: () => number };
  assert.equal(expiry.toMillis(), now + retentionMs);
});

test("signed-out acknowledgement never writes", async () => {
  const { hook, writes } = loadHook(Date.now());
  await hook().markRead("notice");
  assert.equal(writes.length, 0);
});

test("bell keeps unread items and hides expired items before TTL deletion", () => {
  const now = Date.now();
  const { hook, snapshot, states } = loadHook(now);
  hook("student");
  snapshot([
    { id: "unread", data: () => ({ readAt: null, expiresAt: null }) },
    { id: "read", data: () => ({ expiresAt: { toMillis: () => now + retentionMs } }) },
    { id: "expired", data: () => ({ expiresAt: { toMillis: () => now - 1 } }) },
    { id: "boundary", data: () => ({ expiresAt: { toMillis: () => now } }) },
  ]);
  const notifications = [...states].reverse().find((value) => Array.isArray(value)) as { id: string }[];
  assert.equal(notifications.map((item) => item.id).join(","), "unread,read");
});

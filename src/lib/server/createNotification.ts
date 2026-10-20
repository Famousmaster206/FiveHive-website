import {
  FieldValue,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import { dashboardDocumentPaths, type AppNotification } from "../../types/dashboard.ts";

/** Caller checks its durable deduplication receipt in the same transaction. */
export function createNotification(
  transaction: Transaction,
  reference: DocumentReference,
  content: Pick<AppNotification, "type" | "title" | "body" | "href">,
) {
  transaction.create(reference, {
    id: reference.id,
    ...content,
    createdAt: FieldValue.serverTimestamp(),
    readAt: null,
    // Unread notifications never expire; acknowledging sets a 48-hour TTL.
    expiresAt: null,
  });
}

/**
 * Call after all transaction reads, with the result of addXp. The stats update
 * commits with this notification; retries read the new XP and cannot level up
 * twice. One notification names the final level even when an award skips levels.
 */
export function notifyLevelUp(
  transaction: Transaction,
  db: Firestore,
  uid: string,
  progress: { level: number; leveledUp: boolean },
) {
  if (!progress.leveledUp) return;
  createNotification(
    transaction,
    db.doc(dashboardDocumentPaths.notification(uid, `level_up_${progress.level}`)),
    {
      type: "level_up",
      title: "Level up",
      body: `You reached level ${progress.level}!`,
      href: "/dashboard",
    },
  );
}

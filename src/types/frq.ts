import type { Timestamp } from "firebase/firestore";

export interface FRQSubmission {
  id?: string;
  userId: string;
  templateId: string;
  responseText: string;
  submittedAt: Timestamp;
  score?: string;
  grade?: string;
  feedback?: string;
  gradedAt?: Timestamp;
  graderId?: string;
  gradedBy?: string;
  status?: GradingStatus;
  userBanned?: boolean;
  question?: {
    id: string;
  };
}

export type GradingStatus = "ungraded" | "graded" | "flagged" | "rejected";

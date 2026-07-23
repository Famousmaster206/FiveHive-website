import type { Timestamp } from "firebase/firestore";

export interface FRQTemplate {
  id?: string;
  subject: string;
  unitId: string;
  title: string;
  prompt: string;
  isPublic?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
  updatedBy: string;
}

export interface FRQTemplateRef {
  subject: string;
  unitId: string;
  templateId: string;
}

export interface FRQSubmissionBase {
  id?: string;
  ownerUserId: string;
  templateId: string;
  templateRef: FRQTemplateRef;
  responseText: string;
  submittedAt: Timestamp;
  status: GradingStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  userBanned?: boolean;
}

export interface GradableFRQSubmission extends FRQSubmissionBase {
  status: "ungraded" | "flagged" | "rejected";
}

export interface GradedFRQSubmission extends FRQSubmissionBase {
  status: "graded";
  score?: string;
  feedback?: string;
  gradedAt?: Timestamp;
  graderId?: string;
  gradableSubmissionId?: string;
}

export type GradingStatus = "ungraded" | "graded" | "flagged" | "rejected";
export type FRQSubmission = GradableFRQSubmission | GradedFRQSubmission;

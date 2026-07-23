import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  type CollectionReference,
  type DocumentReference,
} from "firebase/firestore";
import type { FRQSubmission, FRQTemplate } from "@/types/frq";

export const FRQ_TEMPLATE_COLLECTION = "frqs";
export const GRADABLE_FRQ_SUBMISSIONS_COLLECTION = "gradable-frq-submissions";
export const GRADED_FRQ_SUBMISSIONS_COLLECTION = "graded-frq-submissions";

export const frqTemplateDocRef = (
  subject: string,
  unitId: string,
  templateId: string,
): DocumentReference => {
  return doc(
    db,
    "subjects",
    subject,
    "units",
    unitId,
    FRQ_TEMPLATE_COLLECTION,
    templateId,
  );
};

export const fetchFrqTemplate = async (
  subject: string,
  unitId: string,
  templateId: string,
): Promise<FRQTemplate | null> => {
  const templateSnap = await getDoc(frqTemplateDocRef(subject, unitId, templateId));
  if (!templateSnap.exists()) return null;
  return { id: templateSnap.id, ...(templateSnap.data() as FRQTemplate) };
};

export const gradableFrqSubmissionsCollection =
  (): CollectionReference<FRQSubmission> =>
    collection(
      db,
      GRADABLE_FRQ_SUBMISSIONS_COLLECTION,
    ) as CollectionReference<FRQSubmission>;

export const gradedFrqSubmissionsCollection =
  (): CollectionReference<FRQSubmission> =>
    collection(db, GRADED_FRQ_SUBMISSIONS_COLLECTION) as CollectionReference<FRQSubmission>;

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

const projectId = "fivehive-frq-rules";

const testEnv = await initializeTestEnvironment({
  projectId,
  firestore: {
    rules: readFileSync(resolve("./firestore.rules"), "utf8"),
  },
});

const adminUid = "admin-user";
const graderUid = "grader-user";
const studentUid = "student-user";
const otherUid = "other-user";

await testEnv.withSecurityRulesDisabled(async (context) => {
  const db = context.firestore();
  await Promise.all([
    setDoc(doc(db, "users", adminUid), { access: "admin" }),
    setDoc(doc(db, "users", graderUid), { access: "grader" }),
    setDoc(doc(db, "users", studentUid), { access: "user" }),
    setDoc(doc(db, "users", otherUid), { access: "user" }),
  ]);
});

const adminDb = testEnv.authenticatedContext(adminUid).firestore();
const graderDb = testEnv.authenticatedContext(graderUid).firestore();
const studentDb = testEnv.authenticatedContext(studentUid).firestore();
const otherDb = testEnv.authenticatedContext(otherUid).firestore();

await assertSucceeds(
  setDoc(doc(adminDb, "subjects", "biology", "units", "unit-1", "frqs", "frq-1"), {
    subject: "biology",
    unitId: "unit-1",
    title: "FRQ 1",
    prompt: "Explain photosynthesis.",
    isPublic: true,
    createdBy: adminUid,
    updatedBy: adminUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }),
);

await assertFails(
  setDoc(doc(studentDb, "subjects", "biology", "units", "unit-1", "frqs", "frq-2"), {
    subject: "biology",
    unitId: "unit-1",
    title: "FRQ 2",
    prompt: "Explain mitosis.",
    isPublic: true,
    createdBy: studentUid,
    updatedBy: studentUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }),
);

await assertSucceeds(
  setDoc(doc(studentDb, "gradable-frq-submissions", "submission-1"), {
    ownerUserId: studentUid,
    templateId: "frq-1",
    templateRef: { subject: "biology", unitId: "unit-1", templateId: "frq-1" },
    responseText: "Student response",
    submittedAt: serverTimestamp(),
    status: "ungraded",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }),
);

await assertFails(
  setDoc(doc(studentDb, "gradable-frq-submissions", "submission-2"), {
    ownerUserId: otherUid,
    templateId: "frq-1",
    templateRef: { subject: "biology", unitId: "unit-1", templateId: "frq-1" },
    responseText: "Bad owner write",
    submittedAt: serverTimestamp(),
    status: "ungraded",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }),
);

await assertSucceeds(
  setDoc(doc(graderDb, "graded-frq-submissions", "submission-1"), {
    ownerUserId: studentUid,
    templateId: "frq-1",
    templateRef: { subject: "biology", unitId: "unit-1", templateId: "frq-1" },
    responseText: "Student response",
    submittedAt: serverTimestamp(),
    status: "graded",
    score: "5/6",
    feedback: "Great structure.",
    graderId: graderUid,
    gradedAt: serverTimestamp(),
    gradableSubmissionId: "submission-1",
    userBanned: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }),
);

await assertFails(
  setDoc(doc(studentDb, "graded-frq-submissions", "submission-2"), {
    ownerUserId: studentUid,
    templateId: "frq-1",
    templateRef: { subject: "biology", unitId: "unit-1", templateId: "frq-1" },
    responseText: "Student response",
    submittedAt: serverTimestamp(),
    status: "graded",
    score: "5/6",
    feedback: "Self graded.",
    graderId: studentUid,
    gradedAt: serverTimestamp(),
    gradableSubmissionId: "submission-1",
    userBanned: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }),
);

await assertSucceeds(getDoc(doc(studentDb, "graded-frq-submissions", "submission-1")));
await assertFails(getDoc(doc(otherDb, "graded-frq-submissions", "submission-1")));

await testEnv.cleanup();

assert.ok(true, "FRQ rules checks completed");
console.log("FRQ firestore rule checks passed.");

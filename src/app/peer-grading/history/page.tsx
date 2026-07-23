"use client";
import React, { useEffect, useState } from "react";
import {
  collection,
  query,
  orderBy,
  getDocs,
  where,
} from "firebase/firestore";
import { useUser } from "@/components/hooks/UserContext";
import { db } from "@/lib/firebase";
import { FileCheck, FileClock, FileWarning, FileX } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  GRADED_FRQ_SUBMISSIONS_COLLECTION,
  GRADABLE_FRQ_SUBMISSIONS_COLLECTION,
} from "@/lib/frq-store";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { FRQSubmission } from "@/types/frq";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const MyFRQResponses = () => {
  const { user } = useUser();
  const [responses, setResponses] = useState<FRQSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  const formatTimestamp = (value: unknown) => {
    if (
      value &&
      typeof value === "object" &&
      "toDate" in value &&
      typeof value.toDate === "function"
    ) {
      const timestampValue = value as { toDate: () => Date };
      return timestampValue.toDate().toLocaleString();
    }
    return "Unknown";
  };

  useEffect(() => {
    const fetchResponses = async () => {
      if (!user) return;

      try {
        const gradableQuery = query(
          collection(db, GRADABLE_FRQ_SUBMISSIONS_COLLECTION),
          where("ownerUserId", "==", user.uid),
          orderBy("submittedAt", "desc"),
        );
        const gradedQuery = query(
          collection(db, GRADED_FRQ_SUBMISSIONS_COLLECTION),
          where("ownerUserId", "==", user.uid),
          orderBy("submittedAt", "desc"),
        );

        const [gradableSnapshot, gradedSnapshot] = await Promise.all([
          getDocs(gradableQuery),
          getDocs(gradedQuery),
        ]);

        const data: FRQSubmission[] = [...gradableSnapshot.docs, ...gradedSnapshot.docs]
          .map((docSnap) => {
            const submission = docSnap.data() as FRQSubmission;
            return {
              id: docSnap.id,
              ...submission,
            };
          })
          .sort((a, b) => {
            const aMillis = a.submittedAt?.toMillis?.() ?? 0;
            const bMillis = b.submittedAt?.toMillis?.() ?? 0;
            return bMillis - aMillis;
          });

        setResponses(data);
      } catch (error) {
        console.error("Error fetching FRQ responses:", error);
      } finally {
        setLoading(false);
      }
    };

    void fetchResponses();
  }, [user]);

  if (!user) {
    return <p>You must be logged in to view your responses.</p>;
  }

  return (
    <>
      <h2 className="text-2xl font-bold">Report</h2>

      {loading ? (
        <p>Loading responses...</p>
      ) : responses.length === 0 ? (
        <p>You haven’t submitted any responses yet.</p>
      ) : (
        <ul className="grid gap-3">
          {responses.map((response) => {
            const completelyGraded = !!response.score && !!response.feedback;

            return (
              <li
                key={response.id}
                className={cn(
                  "rounded-md border-2 p-3 shadow-sm",
                  response.status === "graded" &&
                    (completelyGraded
                      ? "border-green-500 bg-green-100"
                      : "border-blue-500 bg-blue-100"),
                  response.status === "rejected" && "bg-stone-100",
                  response.status === "flagged" && "border-red-500 bg-red-200",
                  (!response.status || response.status === "ungraded") &&
                    "border-amber-300 bg-amber-50",
                )}
              >
                <div className="flex justify-between font-bold">
                  Question:
                  {response.status === "graded" &&
                    (completelyGraded ? (
                      <span className="flex gap-1 text-green-500">
                        <FileCheck />
                        Graded
                      </span>
                    ) : (
                      <span className="flex gap-1 text-blue-500">
                        <FileCheck />
                        Grading in Progress
                      </span>
                    ))}
                  {response.status === "rejected" && (
                    <Popover>
                      <PopoverTrigger className="flex gap-1 text-stone-500">
                        <FileX /> Rejected
                      </PopoverTrigger>
                      <PopoverContent>
                        Your submission was rejected and will not be graded.
                        This may be due to an invalid/irrelevant response or an
                        invalid question selected by you (e.g. if you selected a
                        combination of a question type, year, and exam that does
                        not exist).
                      </PopoverContent>
                    </Popover>
                  )}
                  {response.status === "flagged" && (
                    <Popover>
                      <PopoverTrigger className="flex gap-1 text-red-500">
                        <FileWarning /> Flagged
                      </PopoverTrigger>
                      <PopoverContent>
                        Your submission was flagged and will not be graded. This
                        is most likely due to an innapropriate response from you
                        (e.g. if you used unacceptable profanity or violated our
                        community guidelines).
                      </PopoverContent>
                    </Popover>
                  )}
                  {(!response.status || response.status === "ungraded") && (
                    <span className="flex gap-1 text-amber-500">
                      <FileClock /> Submitted (Awaiting Feedback)
                    </span>
                  )}
                </div>
                <p>qID: {response.templateId}</p>
                {/* <p>qPrompt: {response.question?.prompt}</p> */}

                <Accordion type="single" collapsible className="mb-4">
                  <AccordionItem value="response">
                    <AccordionTrigger>Your Response</AccordionTrigger>
                    <AccordionContent>
                       <pre className="max-w-full overflow-x-auto whitespace-pre-wrap rounded bg-gray-100 p-2 font-mono text-base" style={{ fontFamily: "'Consolas', monospace" }}>                        <code>{response.responseText}</code>
                      </pre>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                {completelyGraded && (
                  <>
                    <strong>Grade:</strong>
                    <p>{response.score}</p>

                    <strong>Feedback:</strong>
                    <p>{response.feedback}</p>

                    {response.gradedAt && (
                      <small>
                        <em>
                          Graded: {formatTimestamp(response.gradedAt)}
                          {response.graderId ? ` by ${response.graderId}` : ""}
                        </em>
                      </small>
                    )}
                  </>
                )}

                <small
                  style={{
                    display: "block",
                    marginTop: "0.5rem",
                    color: "#555",
                  }}
                >
                  Submitted:{" "}
                  {formatTimestamp(response.submittedAt)}
                </small>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
};

export default MyFRQResponses;

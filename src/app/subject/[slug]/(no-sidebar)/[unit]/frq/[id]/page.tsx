"use client";

import FRQTestRenderer from "@/components/frq/testRenderer";
import usePathname from "@/components/client/pathname";
import { fetchFrqTemplate } from "@/lib/frq-store";
import { useEffect, useState } from "react";
import type { FRQTemplate } from "@/types/frq";

const Page = () => {
  const pathname = usePathname();

  const basePath = pathname.split("/").slice(-4).join("_");
  const subject = basePath.split("_")[0]!;
  const unitId = basePath.split("_")[1]?.split("-").at(-1);
  const frqId = basePath.split("_")[3]!;

  const [frq, setFrq] = useState<FRQTemplate | null>();

  useEffect(() => {
    const fetchFRQ = async () => {
      try {
        const template = await fetchFrqTemplate(subject, unitId!, frqId);
        setFrq(template);
      } catch (error: unknown) {
        console.error("Error fetching FRQ data:", error);
      }
    };

    fetchFRQ().catch((error) => {
      console.error("Error fetching FRQ data:", error);
    });
  }, [subject, unitId, frqId]);

  if (frq === undefined) {
    return <div>Loading...</div>;
  }

  return <FRQTestRenderer frq={frq ?? null} />;
};

export default Page;
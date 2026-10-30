import { Suspense } from "react";
import { Loading } from "@/components/ui";
import Planner from "./Planner";

// ?next=1 (from the dashboard's "Generate my week") opens next week.
export default function PlannerPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<Loading label="Loading plan…" />}>
      <Planner searchParams={searchParams} />
    </Suspense>
  );
}

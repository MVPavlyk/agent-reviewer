/* /multi-agent/:multiRunId — Multi-Agent Review results (SPEC-06 G-3/G-4).
   Thin page: AppShell + the MultiAgentResults feature component. */
"use client";

import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { MultiAgentResults } from "./_components/MultiAgentResults";

const CRUMB = [{ label: "Multi-Agent Review", href: "/multi-agent/configure" }];

export default function MultiAgentResultsPage() {
  const params = useParams<{ multiRunId: string }>();
  return (
    <AppShell crumb={CRUMB}>
      <MultiAgentResults multiRunId={params.multiRunId} />
    </AppShell>
  );
}

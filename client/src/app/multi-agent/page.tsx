/* /multi-agent — Multi-Agent Review history (L07). Thin page: AppShell +
   the MultiAgentHistory feature component. This is the GLOBAL nav landing
   page ("Multi-Agent Review"). */
"use client";

import { AppShell } from "@/components/app-shell";
import { MultiAgentHistory } from "./_components/MultiAgentHistory";

const CRUMB = [{ label: "Multi-Agent Review" }];

export default function MultiAgentHistoryPage() {
  return (
    <AppShell crumb={CRUMB}>
      <MultiAgentHistory />
    </AppShell>
  );
}

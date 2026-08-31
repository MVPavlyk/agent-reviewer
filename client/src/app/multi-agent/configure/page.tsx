/* /multi-agent/configure — Configure run (SPEC-06 G-1). Thin page: AppShell +
   the ConfigureRun feature component. */
"use client";

import { AppShell } from "@/components/app-shell";
import { ConfigureRun } from "./_components/ConfigureRun";

const CRUMB = [{ label: "Multi-Agent Review", href: "/multi-agent/configure" }, { label: "Configure run" }];

export default function ConfigureRunPage() {
  return (
    <AppShell crumb={CRUMB}>
      <ConfigureRun />
    </AppShell>
  );
}

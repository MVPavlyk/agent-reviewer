/* FailCiOnControl — the "Fail CI on" segmented control (Critical / Warning+ /
   Never), bound directly to `agent.ci_fail_on`. A click patches the agent via
   the existing `useUpdateAgent` mutation — there is no dedicated endpoint for
   this field (D-4). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Chip } from "@devdigest/ui";
import type { Agent, CiFailOn } from "@devdigest/shared";
import { useUpdateAgent } from "@/lib/hooks/agents";
import { s } from "./styles";

const OPTIONS: readonly { id: CiFailOn; labelKey: string }[] = [
  { id: "critical", labelKey: "critical" },
  { id: "warning", labelKey: "warning" },
  { id: "never", labelKey: "never" },
];

export function FailCiOnControl({ agent }: { agent: Agent }) {
  const tCi = useTranslations("ci");
  const updateAgent = useUpdateAgent();

  return (
    <div style={s.section}>
      <div style={s.sectionLabel}>{tCi("ciTab.failOnLabel")}</div>
      <div role="group" aria-label={tCi("ciTab.failOnLabel")} style={s.chipRow}>
        {OPTIONS.map((opt) => (
          <Chip
            key={opt.id}
            active={agent.ci_fail_on === opt.id}
            onClick={() => updateAgent.mutate({ id: agent.id, patch: { ci_fail_on: opt.id } })}
          >
            {tCi(`ciTab.failOn.${opt.labelKey}`)}
          </Chip>
        ))}
      </div>
    </div>
  );
}

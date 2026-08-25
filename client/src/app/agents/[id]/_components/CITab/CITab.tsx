/* CITab — "CI deployment" tab in the Agent Editor (SPEC-06 Chunk D,
   ADDENDUM v2 item 4). Shows the "Active in N repos" pill (N from
   `useAgentCi`, never hardcoded), the "Fail CI on" segmented control bound
   to `agent.ci_fail_on`, the installations list (repo + badge + status +
   workflow version + PR link + run history), and mounts the Export wizard
   for both "Add repository" and "Update CI config" — the wizard never
   accepts a pre-fill, so both entry points are the same mount (D-C2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentCi } from "@/lib/hooks/ci";
import { ExportWizard } from "./ExportWizard";
import { FailCiOnControl } from "./FailCiOnControl";
import { InstallationsList } from "./InstallationsList";
import { s } from "./styles";

export function CITab({ agent }: { agent: Agent }) {
  const tCi = useTranslations("ci");
  const { data: installations, isLoading } = useAgentCi(agent.id);
  const [wizardOpen, setWizardOpen] = React.useState(false);

  const count = installations?.length ?? 0;

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h3 style={s.title}>{tCi("ciTab.heading")}</h3>
          {!isLoading && count > 0 && <Badge>{tCi("ciTab.activeIn", { count })}</Badge>}
        </div>
        {!isLoading && count > 0 && (
          <Button kind="secondary" onClick={() => setWizardOpen(true)}>
            {tCi("ciTab.updateConfig")}
          </Button>
        )}
      </div>

      <FailCiOnControl agent={agent} />

      {isLoading && (
        <div style={s.installList} aria-label={tCi("ciTab.loading")}>
          <Skeleton height={90} />
          <Skeleton height={90} />
        </div>
      )}

      {!isLoading && count === 0 && (
        <EmptyState
          icon="Workflow"
          title={tCi("ciTab.empty.title")}
          body={tCi("ciTab.empty.body")}
          cta={tCi("ciTab.addToCi")}
          onCta={() => setWizardOpen(true)}
        />
      )}

      {!isLoading && count > 0 && (
        <InstallationsList installations={installations ?? []} onAddRepository={() => setWizardOpen(true)} />
      )}

      {wizardOpen && (
        <ExportWizard agentId={agent.id} agentName={agent.name} onClose={() => setWizardOpen(false)} />
      )}
    </div>
  );
}

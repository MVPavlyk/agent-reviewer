/* ResultsHeader — breadcrumb lives in AppShell's `crumb` (page-level); this
   renders the subtitle, PR title, and the aggregate meta line (AC-13). */
"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { MultiAgentRun } from "@devdigest/shared";
import { formatCost } from "@/components/run-cost-badge/format";
import { s } from "./styles";

export function ResultsHeader({ run, prTitle }: { run: MultiAgentRun; prTitle?: string | null }) {
  const t = useTranslations("multiAgent");
  const router = useRouter();

  return (
    <div style={s.root}>
      <div style={s.topRow}>
        <div style={s.subtitle}>{t("results.subtitle", { count: run.agent_count })}</div>
        <Button kind="secondary" size="sm" onClick={() => router.push(`/multi-agent/configure?prId=${run.pr_id}`)}>
          {t("results.configureRun")}
        </Button>
      </div>
      <div style={s.title}>
        <span className="mono" style={s.prNumber}>
          #{run.pr_number ?? "—"}
        </span>
        {prTitle}
      </div>
      <div style={s.meta}>
        {t("results.meta", {
          count: run.agent_count,
          seconds: (run.total_duration_ms / 1000).toFixed(1),
          cost: formatCost(run.total_cost_usd),
        })}
      </div>
    </div>
  );
}

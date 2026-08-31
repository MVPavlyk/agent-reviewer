/* MultiAgentHistory — the global "Multi-Agent Review" nav landing page
   (L07). Lists past multi-agent runs newest-first; each row opens that
   run's results. `?prId=` (URL search param — shareable/survives refresh)
   scopes the list to one PR's runs, reached from the PR-detail header's
   "Multi-agent runs" link. */
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState } from "@devdigest/ui";
import { useMultiAgentRuns } from "@/lib/hooks";
import { formatCost } from "@/components/run-cost-badge/format";
import { s } from "./styles";

export function MultiAgentHistory() {
  const t = useTranslations("multiAgent");
  const search = useSearchParams();
  const prId = search.get("prId");

  const { data: runs } = useMultiAgentRuns(prId);

  const configureHref = prId ? `/multi-agent/configure?prId=${prId}` : "/multi-agent/configure";
  const title =
    prId && runs && runs.length > 0
      ? t("history.titleForPr", { number: runs[0]!.pr_number ?? "—" })
      : t("history.title");

  return (
    <div style={s.page}>
      <div style={s.topRow}>
        <div style={s.title}>{title}</div>
        <Link href={configureHref}>
          <Button kind="primary" icon="Play">
            {t("history.runButton")}
          </Button>
        </Link>
      </div>

      {!runs || runs.length === 0 ? (
        <EmptyState icon="Users" title={t("history.empty")} body={t("history.emptyBody")} />
      ) : (
        <div style={s.list}>
          {runs.map((run) => (
            <Link key={run.id} href={`/multi-agent/${run.id}?prId=${run.pr_id}`} style={s.row}>
              <div style={s.rowLeft}>
                <div style={s.prLine}>
                  <span className="mono" style={s.prNumber}>
                    #{run.pr_number ?? "—"}
                  </span>
                  {run.pr_title ?? "—"}
                </div>
                <div style={s.ranAt}>{new Date(run.ran_at).toLocaleString()}</div>
              </div>
              <div style={s.rowRight}>
                <span>{run.agent_count} agents</span>
                <span>{formatCost(run.total_cost_usd)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

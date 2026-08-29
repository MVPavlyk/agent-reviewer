/* CompareModal — Крок 18, the screen the L-06 handoff is judged on. Shows,
   for two eval run batches of the same agent: (1) their recall/precision/
   citation aggregates side by side, (2) a "changed N of Y cases" summary
   line (AC-65a), (3) a per-case table classifying what changed, regressions
   first (AC-65/EC-16), and (4) a line diff of the two `system_prompt_snapshot`
   values — never the agent's current live prompt (AC-64/EC-19). No `Promote
   v7` button (N-3) — this modal is read-only evidence, not an action. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal, Skeleton, ErrorState } from "@devdigest/ui";
import { formatMetric } from "@/components/eval-metric/format";
import { formatCost } from "@/components/run-cost-badge/format";
import { versionLabel, formatDelta } from "@/components/eval-batch/format";
import { promptDiff } from "./prompt-diff";
import { classifyCases, sortWithRegressionsFirst, summarizeTransitions, type ClassifiedCase, type CaseVerdict } from "./case-transitions";
import { useEvalCompare } from "@/lib/hooks/evals";
import { s } from "./styles";

/** "old → new" plus a delta, for one metric row. Null-safe (AC-62/P-2): a
 *  `null` on either side renders "—" for that value, and the row never
 *  shows a delta — there is nothing to subtract. Cost is dollar-formatted
 *  (`formatCost`); recall/precision/citation are percentage-formatted
 *  (`formatMetric`/`formatDelta`), matching every other metric display in
 *  this feature. */
function metricRowText(
  kind: "percent" | "cost",
  a: number | null,
  b: number | null,
): { valueA: string; valueB: string; delta: string | null } {
  const formatValue = kind === "cost" ? formatCost : formatMetric;
  const valueA = formatValue(a);
  const valueB = formatValue(b);
  if (a == null || b == null) return { valueA, valueB, delta: null };
  if (kind === "cost") {
    const diff = b - a;
    if (diff === 0) return { valueA, valueB, delta: "±$0.00" };
    return { valueA, valueB, delta: diff > 0 ? `▲${formatCost(diff)}` : `▼${formatCost(Math.abs(diff))}` };
  }
  return { valueA, valueB, delta: formatDelta(b - a) };
}

function verdictText(
  t: ReturnType<typeof useTranslations>,
  row: ClassifiedCase,
  side: "a" | "b",
  versionA: string,
  versionB: string,
): string {
  const verdict: CaseVerdict | null = side === "a" ? row.verdict_a : row.verdict_b;
  if (verdict === null) {
    return t("compare.onlyIn", { version: side === "a" ? versionB : versionA });
  }
  return t(`compare.verdict.${verdict}`);
}

export function CompareModal({
  batchIdA,
  batchIdB,
  onClose,
}: {
  batchIdA: string;
  batchIdB: string;
  onClose: () => void;
}) {
  const t = useTranslations("eval");
  const { data, isLoading, isError } = useEvalCompare(batchIdA, batchIdB);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (isLoading || !data) {
    return (
      <Modal title={t("compare.title")} onClose={onClose} width={860}>
        <div style={s.body}>
          {isError ? <ErrorState body={t("compare.error")} /> : <Skeleton height={200} />}
        </div>
      </Modal>
    );
  }

  const { batch_a, batch_b, cases } = data;
  const versionA = versionLabel(batch_a.agent_version);
  const versionB = versionLabel(batch_b.agent_version);
  const classified = sortWithRegressionsFirst(classifyCases(cases));
  const summary = summarizeTransitions(cases);
  const diffLines = promptDiff(batch_a.system_prompt_snapshot, batch_b.system_prompt_snapshot);

  const metricRows: { key: string; label: string; kind: "percent" | "cost"; a: number | null; b: number | null }[] = [
    { key: "recall", label: t("dashboard.metrics.recall"), kind: "percent", a: batch_a.recall, b: batch_b.recall },
    { key: "precision", label: t("dashboard.metrics.precision"), kind: "percent", a: batch_a.precision, b: batch_b.precision },
    {
      key: "citation",
      label: t("dashboard.metrics.citationAccuracy"),
      kind: "percent",
      a: batch_a.citation_accuracy,
      b: batch_b.citation_accuracy,
    },
    { key: "cost", label: t("dashboard.table.cost"), kind: "cost", a: batch_a.cost_usd, b: batch_b.cost_usd },
  ];

  return (
    <Modal
      title={t("compare.title")}
      subtitle={t("compare.subtitle", { versionA, versionB })}
      onClose={onClose}
      width={860}
    >
      <div style={s.body}>
        <section>
          <div style={s.sectionLabel}>{t("compare.metrics")}</div>
          <div style={s.metricsRow}>
            {metricRows.map((m) => {
              const { valueA, valueB, delta } = metricRowText(m.kind, m.a, m.b);
              return (
                <div key={m.key} style={s.metricLine}>
                  <span style={s.metricLabel}>{m.label}</span>
                  <span className="tnum">
                    {valueA} → {valueB}
                  </span>
                  <span className="tnum" style={s.metricDelta}>
                    {delta ?? "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <div style={s.summaryLine}>{t("compare.changedSummary", { n: summary.n, y: summary.y })}</div>
        </section>

        <section>
          <div style={s.sectionLabel}>{t("compare.casesTitle")}</div>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>{t("compare.table.case")}</th>
                <th style={s.th}>{versionA}</th>
                <th style={s.th}>{versionB}</th>
              </tr>
            </thead>
            <tbody>
              {classified.map((row) => (
                <tr key={row.case_id}>
                  <td style={s.td} className="mono">
                    {row.case_name}
                  </td>
                  <td style={s.td}>{verdictText(t, row, "a", versionA, versionB)}</td>
                  <td style={s.td}>{verdictText(t, row, "b", versionA, versionB)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <div style={s.sectionLabel}>{t("compare.promptDiff")}</div>
          <pre className="mono" style={s.diffBlock}>
            {diffLines.map((line, i) => (
              <div key={i} style={s.diffLine(line.kind)}>
                {line.kind === "added" ? "+ " : line.kind === "removed" ? "- " : "  "}
                {line.text}
              </div>
            ))}
          </pre>
        </section>
      </div>
    </Modal>
  );
}

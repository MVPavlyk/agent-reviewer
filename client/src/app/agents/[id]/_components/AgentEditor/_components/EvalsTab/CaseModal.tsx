/* CaseModal — read-only view of one eval case (AC-53). Diff, expected_output,
   and the result of its last run. Deliberately NO `Run case`, `Save`,
   `Delete`, "Run on save" toggle, and no `Files`/`PR meta` tabs (N-1, N-2) —
   this is a viewer, not the case editor Non-goals explicitly exclude. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalCaseRecord } from "@devdigest/shared";
import { Modal, Badge } from "@devdigest/ui";
import { caseRunStatus, expectedFindings } from "./helpers";

export function CaseModal({ row, onClose }: { row: EvalCaseRecord; onClose: () => void }) {
  const t = useTranslations("agents");

  // Escape closes the modal (Modal itself only wires the backdrop click + X).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const status = caseRunStatus(row);
  const findings = expectedFindings(row);

  return (
    <Modal title={row.name} subtitle={t("editor.evals.case.modalSubtitle")} onClose={onClose} width={760}>
      <div style={{ padding: "18px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
        <section>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: "var(--text-muted)", marginBottom: 6 }}>
            {t("editor.evals.case.lastRun")}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Badge>{t(`editor.evals.case.status.${status}`)}</Badge>
            {row.last_run && (
              <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                {new Date(row.last_run.ran_at).toLocaleString()}
              </span>
            )}
          </div>
        </section>

        <section>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: "var(--text-muted)", marginBottom: 6 }}>
            {t("editor.evals.case.diff")}
          </div>
          <pre
            className="mono"
            style={{
              margin: 0,
              padding: 12,
              borderRadius: 7,
              border: "1px solid var(--border)",
              background: "var(--bg-elevated)",
              fontSize: 12,
              lineHeight: 1.5,
              overflow: "auto",
              maxHeight: 320,
              whiteSpace: "pre",
            }}
          >
            {row.input_diff}
          </pre>
        </section>

        <section>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: "var(--text-muted)", marginBottom: 6 }}>
            {t("editor.evals.case.expectedOutput")}
          </div>
          {findings.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{t("editor.evals.case.expectedEmpty")}</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {findings.map((f, i) => (
                <div
                  key={`${f.file}:${f.start_line}:${i}`}
                  style={{ border: "1px solid var(--border)", borderRadius: 7, padding: 10, fontSize: 12.5 }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{f.title}</div>
                  <div className="mono" style={{ color: "var(--text-muted)" }}>
                    {f.file}:{f.start_line}
                    {f.end_line !== f.start_line ? `-${f.end_line}` : ""}
                  </div>
                  <Badge>
                    {f.severity.toUpperCase()} · {f.category}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}

"use client";

import { useTranslations } from "next-intl";
import type { BlastRadius } from "@/vendor/shared";
import { CallerLink } from "../CallerLink/CallerLink";
import { ImpactChips } from "../ImpactChips/ImpactChips";

interface SymbolTreeProps {
  radius: BlastRadius;
  repoFullName: string | null;
  /** `coverage.last_indexed_sha` — see CallerLink for why this isn't the
   *  PR's `head_sha`. */
  indexedSha: string | null;
}

/** Changed-symbol tree: one entry per symbol with downstream impact, its
 *  callers, and the endpoints/crons reachable through it. */
export function SymbolTree({ radius, repoFullName, indexedSha }: SymbolTreeProps) {
  const t = useTranslations("blast");

  return (
    <ul role="tree" style={{ display: "flex", flexDirection: "column", gap: 14, margin: 0, padding: 0, listStyle: "none" }}>
      {radius.downstream.map((d) => (
        <li key={`${d.symbol}:${d.callers[0]?.file ?? ""}`} role="treeitem" aria-label={d.symbol}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>
            <span className="mono">{d.symbol}</span>{" "}
            <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
              {t("callerCount", { count: d.callers_total })}
              {d.callers_truncated ? " +" : ""}
            </span>
          </div>
          <ul style={{ margin: "6px 0 0", padding: "0 0 0 14px", listStyle: "none", display: "flex", flexDirection: "column", gap: 3 }}>
            {d.callers.map((c) => (
              <li key={`${c.file}:${c.line}`} style={{ fontSize: 12 }}>
                <CallerLink repoFullName={repoFullName} indexedSha={indexedSha} file={c.file} line={c.line} />
                <span style={{ color: "var(--text-muted)" }}> — {c.name}</span>
              </li>
            ))}
          </ul>
          <ImpactChips endpoints={d.endpoints_affected} crons={d.crons_affected} />
        </li>
      ))}
    </ul>
  );
}

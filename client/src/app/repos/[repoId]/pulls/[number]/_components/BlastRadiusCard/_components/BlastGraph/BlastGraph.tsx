"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";
import type { BlastRadius } from "@/vendor/shared";
import { CallerLink } from "../CallerLink/CallerLink";

interface BlastGraphProps {
  radius: BlastRadius;
  repoFullName: string | null;
  /** `coverage.last_indexed_sha` — see CallerLink for why this isn't the
   *  PR's `head_sha`. */
  indexedSha: string | null;
}

const columnStyle: CSSProperties = { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 };

/** Simple three-column graph view: changed symbol -> callers -> endpoints.
 *  No graph-drawing library — the plan explicitly scopes this to a plain
 *  layout (see docs/features/blast-radius.md §9.4). */
export function BlastGraph({ radius, repoFullName, indexedSha }: BlastGraphProps) {
  const t = useTranslations("blast");

  if (radius.downstream.length === 0) {
    return <EmptyState title={t("graph.empty")} />;
  }

  return (
    <div
      aria-label={t("graph.ariaLabel")}
      style={{ display: "flex", gap: 24, alignItems: "flex-start" }}
    >
      <div style={columnStyle}>
        {radius.downstream.map((d) => (
          <div key={d.symbol} className="mono" style={{ fontSize: 12.5, fontWeight: 600 }}>
            {d.symbol}
          </div>
        ))}
      </div>
      <div style={columnStyle}>
        {radius.downstream.map((d) => (
          <div key={d.symbol} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {d.callers.map((c) => (
              <CallerLink key={`${c.file}:${c.line}`} repoFullName={repoFullName} indexedSha={indexedSha} file={c.file} line={c.line} />
            ))}
          </div>
        ))}
      </div>
      <div style={columnStyle}>
        {radius.downstream.map((d) => (
          <div key={d.symbol} style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12 }}>
            {[...d.endpoints_affected, ...d.crons_affected].map((ref) => (
              <span key={`${ref.value}:${ref.file}`}>{ref.value}</span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useTranslations } from "next-intl";
import type { BlastRadius } from "@/vendor/shared";

interface BlastStatsProps {
  radius: BlastRadius;
}

/** "2 symbols · 14 callers · 3 endpoints · 1 cron" — derived entirely from
 *  props during render, no state. */
export function BlastStats({ radius }: BlastStatsProps) {
  const t = useTranslations("blast");
  const callers = radius.downstream.reduce((sum, d) => sum + d.callers_total, 0);
  const endpoints = new Set(radius.downstream.flatMap((d) => d.endpoints_affected.map((e) => e.value)))
    .size;
  const crons = new Set(radius.downstream.flatMap((d) => d.crons_affected.map((c) => c.value))).size;

  return (
    <div style={{ display: "flex", gap: 16, fontSize: 12.5, color: "var(--text-muted)" }}>
      <span>
        <strong style={{ color: "var(--text-primary)" }}>{radius.changed_symbols.length}</strong>{" "}
        {t("stat.symbols")}
      </span>
      <span>
        <strong style={{ color: "var(--text-primary)" }}>{callers}</strong> {t("stat.callers")}
      </span>
      <span>
        <strong style={{ color: "var(--text-primary)" }}>{endpoints}</strong> {t("stat.endpoints")}
      </span>
      <span>
        <strong style={{ color: "var(--text-primary)" }}>{crons}</strong> {t("stat.crons")}
      </span>
    </div>
  );
}

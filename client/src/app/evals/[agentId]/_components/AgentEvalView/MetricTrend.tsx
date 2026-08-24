/* MetricTrend — three-line (recall/precision/citation) trend over an agent's
   eval batches, on the existing `vendor/ui/charts/LineChart` recharts wrap.
   Renders nothing below two points (AC-59 requires 2+ points to be
   meaningful; a single point isn't a trend). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { LineChart } from "@/vendor/ui/charts/LineChart";
import type { EvalBatchRecord } from "@devdigest/shared";
import { trendSeries } from "./helpers";
import { s } from "./styles";

export function MetricTrend({ batches }: { batches: EvalBatchRecord[] }) {
  const t = useTranslations("eval");

  if (batches.length < 2) return null;

  return (
    <div style={s.trendBlock}>
      <h2 style={s.h2}>{t("dashboard.metricTrend")}</h2>
      <LineChart series={trendSeries(batches)} />
      <div style={s.legend}>
        <span style={s.legendItem}>
          <span style={s.legendDot("var(--accent)")} />
          {t("dashboard.legend.recall")}
        </span>
        <span style={s.legendItem}>
          <span style={s.legendDot("var(--ok)")} />
          {t("dashboard.legend.precision")}
        </span>
        <span style={s.legendItem}>
          <span style={s.legendDot("var(--warn)")} />
          {t("dashboard.legend.citation")}
        </span>
      </div>
    </div>
  );
}

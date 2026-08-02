"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { formatCost, formatTokenTotal, NO_COST } from "./format";

export type RunCostBadgeProps = {
  costUsd: number | null | undefined;
  variant?: "compact" | "detailed";
  tokensIn?: number | null;
  tokensOut?: number | null;
  title?: string;
  style?: CSSProperties;
};

export function RunCostBadge({
  costUsd,
  variant = "compact",
  tokensIn,
  tokensOut,
  title,
  style,
}: RunCostBadgeProps) {
  const t = useTranslations("common");
  const known = costUsd != null && Number.isFinite(costUsd);
  const cost = formatCost(costUsd);
  const tokens = variant === "detailed" ? formatTokenTotal(tokensIn, tokensOut) : null;

  const hover =
    title ??
    (!known
      ? t("runCost.unknownTitle")
      : variant === "detailed"
        ? t("runCost.runTitle")
        : t("runCost.prTitle"));

  return (
    <span
      className="mono"
      title={hover}
      style={{
        whiteSpace: "nowrap",
        color: known ? "var(--text-secondary)" : "var(--text-muted)",
        ...style,
      }}
    >
      {tokens ? `${tokens} · ` : ""}
      {cost}
    </span>
  );
}

export { formatCost, formatTokenTotal, NO_COST };

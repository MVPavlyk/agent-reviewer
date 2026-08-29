import type { RiskLevel } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

/** Color + icon per overall risk verdict (SPEC-04 AC-12) — the badge always
 *  pairs the color with a text label (`t("brief.riskLevel.<level>")`), never
 *  color alone (WCAG AA — mirrors `SeverityBadge`'s own rule). */
export const RISK_LEVEL_STYLE: Record<RiskLevel, { color: string; bg: string; icon: IconName }> = {
  low: { color: "var(--ok)", bg: "var(--ok-bg)", icon: "CheckCircle" },
  medium: { color: "var(--warn)", bg: "var(--warn-bg)", icon: "AlertTriangle" },
  high: { color: "var(--crit)", bg: "var(--crit-bg)", icon: "AlertOctagon" },
};

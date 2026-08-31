/* ModeToggle — segmented Columns|Tabs switch. State lives in `?mode=`
   (AC-14/EC-10) — the parent owns the URL, this is a controlled view. */
"use client";

import { useTranslations } from "next-intl";
import { s } from "./styles";

export type ResultsMode = "columns" | "tabs";

export function ModeToggle({ mode, onChange }: { mode: ResultsMode; onChange: (m: ResultsMode) => void }) {
  const t = useTranslations("multiAgent");
  const options: { key: ResultsMode; label: string }[] = [
    { key: "columns", label: t("results.modeColumns") },
    { key: "tabs", label: t("results.modeTabs") },
  ];

  return (
    <div role="radiogroup" aria-label="Results view mode" style={s.root}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={mode === o.key}
          onClick={() => onChange(o.key)}
          style={s.option(mode === o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

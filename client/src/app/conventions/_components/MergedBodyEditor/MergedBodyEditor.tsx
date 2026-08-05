/* MergedBodyEditor — editable markdown pane for the merged skill body: a
   filename-tab header + a `~N tokens` estimate (same `ceil(len/4)` formula
   PromptBlock uses for its read-only token count) over a mono Textarea.
   PromptBlock itself isn't reused here — it has no `onChange`, built purely
   for read-only trace display. */
"use client";

import { useTranslations } from "next-intl";
import { Textarea } from "@devdigest/ui";
import { s } from "./styles";

export function MergedBodyEditor({
  filename,
  value,
  onChange,
  invalid,
}: {
  filename: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
}) {
  const t = useTranslations("conventions");
  const tokens = Math.ceil(value.length / 4);

  return (
    <div style={s.wrap}>
      <div style={s.tab}>
        <span className="mono" style={s.filename}>
          {filename}
        </span>
        <span style={s.tokens}>{t("modal.tokens", { count: tokens })}</span>
      </div>
      <Textarea value={value} onChange={onChange} rows={14} mono invalid={invalid} />
    </div>
  );
}

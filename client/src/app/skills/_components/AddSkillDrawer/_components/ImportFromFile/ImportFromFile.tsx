/* ImportFromFile — a click-to-pick file input for .md/.zip. Base64 is produced
   client-side via FileReader.readAsDataURL with the data: prefix stripped
   (api.ts stays a plain JSON POST, no multipart transport — see
   docs/specs/skills.md "Import transport and library"). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { s } from "./styles";

export function ImportFromFile({
  pending,
  error,
  onFile,
}: {
  pending: boolean;
  error: string | null;
  onFile: (filename: string, contentBase64: string) => void;
}) {
  const t = useTranslations("skills");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      onFile(file.name, base64);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={s.dropZone} onClick={() => inputRef.current?.click()}>
      <input
        ref={inputRef}
        type="file"
        accept=".md,.markdown,.zip"
        style={{ display: "none" }}
        onChange={handleChange}
        aria-label={t("import.chooseFile")}
      />
      <Icon.Upload size={22} style={s.dropIcon} />
      <div style={s.dropLabel}>{pending ? t("import.reading") : t("import.chooseFile")}</div>
      <div style={s.dropHint}>{t("import.accepted")}</div>
      {error && <div style={s.dropError}>{error}</div>}
    </div>
  );
}

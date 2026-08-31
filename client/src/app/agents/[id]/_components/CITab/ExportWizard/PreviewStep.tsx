/* PreviewStep — wizard step 2: two-pane preview of the server-generated CI
   bundle (AC-15/16/17). The file list and `contents` are exactly what the
   server returned from `useExportCi` — no client-side YAML/manifest
   generation (N-3). `contents` is rendered as plain text (JSX escaping, no
   `dangerouslySetInnerHTML`, NFR-2) inside a scrolling `<pre>` so a long
   `system_prompt` doesn't blow up the wizard layout (EC-7). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Skeleton, ErrorState } from "@devdigest/ui";
import type { CiFile } from "@devdigest/shared";
import { s } from "./styles";

export interface PreviewStepProps {
  files: CiFile[] | null;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onBack: () => void;
  onContinue: () => void;
}

export function PreviewStep({ files, isLoading, isError, onRetry, onBack, onContinue }: PreviewStepProps) {
  const tCi = useTranslations("ci");
  const t = (key: string) => tCi(`exportWizard.${key}`);
  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);

  // Keep the selection valid as the file set changes (trigger edits re-fetch
  // the preview, AC-19) — default to the first file whenever the current
  // selection isn't in the new list.
  React.useEffect(() => {
    if (!files || files.length === 0) {
      setSelectedPath(null);
      return;
    }
    if (!files.some((f) => f.path === selectedPath) && files[0]) {
      setSelectedPath(files[0].path);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  const selectedFile = files?.find((f) => f.path === selectedPath) ?? null;

  return (
    <div>
      <div style={s.body}>
        {isError ? (
          <ErrorState title={t("previewError")} onRetry={onRetry} />
        ) : isLoading && !files ? (
          <Skeleton height={280} />
        ) : (
          <div style={s.previewLayout}>
            <div style={s.fileList}>
              <div style={s.fileListHeading}>{t("filesToCreate")}</div>
              <ul aria-label={t("filesToCreate")} style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {(files ?? []).map((file) => (
                  <li key={file.path}>
                    <button
                      type="button"
                      onClick={() => setSelectedPath(file.path)}
                      style={{
                        ...s.fileRow,
                        ...(file.path === selectedPath ? s.fileRowSelected : {}),
                        width: "100%",
                      }}
                    >
                      <Icon.FileText size={13} style={{ flexShrink: 0 }} />
                      <span>{file.path}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div style={s.previewPane}>
              <div role="heading" aria-level={3} style={s.previewHeader}>
                {selectedFile?.path ?? ""}
              </div>
              <pre className="mono" style={s.previewContents}>
                {selectedFile?.contents ?? ""}
              </pre>
            </div>
          </div>
        )}
      </div>

      <div style={s.footer}>
        <Button kind="ghost" icon="ChevronLeft" onClick={onBack}>
          {t("back")}
        </Button>
        <Button
          kind="primary"
          iconRight="ArrowRight"
          onClick={onContinue}
          disabled={isLoading || isError || !files || files.length === 0}
        >
          {t("continue")}
        </Button>
      </div>
    </div>
  );
}

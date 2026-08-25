/* ExportWizard — the "Export to CI" 4-step modal (SPEC-06). Wizard
   selections (target/repo/triggers/post_as/install option) are ephemeral
   client-owned state (`useState`, NFR-4) — never persisted to the URL or a
   store, and never pre-filled from a prior export (D-C2, owned by the CI tab
   that mounts this component). All server data flows through `useExportCi`
   (Chunk B) — no client-side YAML/manifest generation (N-3). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal, ExportWizardSteps } from "@devdigest/ui";
import type { CiFile } from "@devdigest/shared";
import { useExportCi } from "@/lib/hooks/ci";
import { ciFilesToZipBlob } from "@/lib/ci-bundle-zip";
import { TargetStep } from "./TargetStep";
import { PreviewStep } from "./PreviewStep";
import { ConfigureStep } from "./ConfigureStep";
import { InstallStep } from "./InstallStep";
import type { InstallOption, InstallResult, PostAs, WizardStep, WizardTarget } from "./types";

export interface ExportWizardProps {
  agentId: string;
  agentName: string;
  onClose: () => void;
}

const DEFAULT_TRIGGERS = ["opened", "synchronize"];
const PREVIEW_DEBOUNCE_MS = 400;

/** Trigger the browser's native file-save flow for a generated zip Blob. */
function downloadZipBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ExportWizard({ agentId, agentName, onClose }: ExportWizardProps) {
  const tCi = useTranslations("ci");
  const t = (key: string, values?: Record<string, string | number>) => tCi(`exportWizard.${key}`, values);

  const [step, setStep] = React.useState<WizardStep>(0);
  const [target, setTarget] = React.useState<WizardTarget>("gha");
  const [repo, setRepo] = React.useState("");
  const [triggers, setTriggers] = React.useState<string[]>(DEFAULT_TRIGGERS);
  const [postAs, setPostAs] = React.useState<PostAs>("github_review");
  const [installOption, setInstallOption] = React.useState<InstallOption>("files");

  const [previewFiles, setPreviewFiles] = React.useState<CiFile[] | null>(null);
  const [previewError, setPreviewError] = React.useState(false);
  const [installResult, setInstallResult] = React.useState<InstallResult | null>(null);

  const previewExport = useExportCi(agentId);
  const installExport = useExportCi(agentId);

  const triggersKey = triggers.join(",");
  React.useEffect(() => {
    // Only the preview step (and beyond) needs the server bundle — no
    // request fires while the user is still on Target (NFR-1).
    // `action:'preview'` is side-effect-free (no GitHub write, no DB
    // write) — the debounced request must NEVER use 'open_pr', which now
    // opens a real pull request (ADDENDUM v2, Pass 5/7).
    if (step < 1 || target !== "gha" || !repo.trim()) return;
    const id = setTimeout(() => {
      previewExport.mutate(
        { repo, target: "gha", action: "preview", post_as: postAs, triggers, base: "main" },
        {
          onSuccess: (data) => {
            setPreviewFiles(data.files);
            setPreviewError(false);
          },
          onError: () => setPreviewError(true),
        },
      );
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, repo, target, triggersKey, postAs]);

  const requestPreviewNow = () => {
    if (target !== "gha" || !repo.trim()) return;
    previewExport.mutate(
      { repo, target: "gha", action: "preview", post_as: postAs, triggers, base: "main" },
      {
        onSuccess: (data) => {
          setPreviewFiles(data.files);
          setPreviewError(false);
        },
        onError: () => setPreviewError(true),
      },
    );
  };

  const handleToggleTrigger = (trigger: string) => {
    setTriggers((prev) => (prev.includes(trigger) ? prev.filter((tr) => tr !== trigger) : [...prev, trigger]));
  };

  const handleInstall = () => {
    const action = installOption === "open_pr" ? "open_pr" : "files";
    installExport.mutate(
      { repo, target: "gha", action, post_as: postAs, triggers, base: "main" },
      {
        onSuccess: (data) => {
          if (action === "files") {
            const blob = ciFilesToZipBlob(data.files);
            downloadZipBlob(blob, `${repo.replace("/", "-") || "devdigest-ci"}.zip`);
          }
          // Success is shown in-wizard (PR link and/or the once-only
          // ingest token) — the user closes explicitly via Done, so the
          // token isn't shown-then-lost behind an auto-close.
          setInstallResult({ prUrl: data.pr_url, ingestToken: data.ingest_token });
        },
      },
    );
  };

  const stepLabels = [t("steps.target"), t("steps.preview"), t("steps.configure"), t("steps.install")];

  return (
    <Modal
      width={860}
      title={t("title")}
      subtitle={t("subtitle", { agentName: agentName || t("thisAgent") })}
      onClose={onClose}
      footer={null}
    >
      <div style={{ padding: "16px 24px 0" }}>
        <ExportWizardSteps step={step} labels={stepLabels} />
      </div>

      {step === 0 && (
        <TargetStep
          target={target}
          onSelectTarget={setTarget}
          repo={repo}
          onRepoChange={setRepo}
          onContinue={() => setStep(1)}
        />
      )}
      {step === 1 && (
        <PreviewStep
          files={previewFiles}
          isLoading={previewExport.isPending}
          isError={previewError}
          onRetry={requestPreviewNow}
          onBack={() => setStep(0)}
          onContinue={() => setStep(2)}
        />
      )}
      {step === 2 && (
        <ConfigureStep
          triggers={triggers}
          onToggleTrigger={handleToggleTrigger}
          postAs={postAs}
          onChangePostAs={setPostAs}
          onBack={() => setStep(1)}
          onContinue={() => setStep(3)}
        />
      )}
      {step === 3 && (
        <InstallStep
          repo={repo}
          fileCount={previewFiles?.length ?? 0}
          installOption={installOption}
          onChangeInstallOption={setInstallOption}
          onBack={() => setStep(2)}
          onInstall={handleInstall}
          isPending={installExport.isPending}
          isError={installExport.isError}
          result={installResult}
          onDone={onClose}
        />
      )}
    </Modal>
  );
}

/* AgentMultiPicker — PR-page "Pick agents to run" (SPEC-06 AC-10/11/12).
   Mounts the shared AgentPicker in a modal; on confirm it starts a
   multi-agent run via the same POST /pulls/:id/multi-agent-run path Configure
   run uses, then navigates to the results page. Sits BESIDE
   RunReviewDropdown (D-2c) — this is an additional path, not a replacement. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { AgentPicker } from "@/components/agent-picker";
import { useRunMultiAgent } from "@/lib/hooks";
import { ApiError } from "@/lib/api";

export function AgentMultiPicker({ prId }: { prId: string }) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const run = useRunMultiAgent();

  const close = () => {
    setOpen(false);
    setSelectedIds([]);
  };

  const handleConfirm = async () => {
    if (selectedIds.length === 0) return;
    try {
      const res = await run.mutateAsync({ prId, agentIds: selectedIds });
      close();
      router.push(`/multi-agent/${res.id}?prId=${prId}`);
    } catch {
      // Error stays on-screen via run.isError (EC-7) — no navigation.
    }
  };

  return (
    <>
      <Button kind="secondary" size="sm" icon="Users" onClick={() => setOpen(true)}>
        {t("multiPicker.trigger")}
      </Button>
      {open && (
        <Modal
          title={t("multiPicker.modalTitle")}
          subtitle={t("multiPicker.modalSubtitle")}
          onClose={close}
          footer={
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {run.isError && (
                <div role="alert" style={{ fontSize: 12.5, color: "var(--crit)" }}>
                  <strong>{t("multiPicker.errorTitle")}</strong>
                  <div>{run.error instanceof ApiError ? run.error.message : t("multiPicker.errorBody")}</div>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <Button kind="ghost" size="sm" onClick={close}>
                  {t("multiPicker.cancel")}
                </Button>
                <Button
                  kind="primary"
                  size="sm"
                  disabled={selectedIds.length === 0 || run.isPending}
                  loading={run.isPending}
                  onClick={handleConfirm}
                >
                  {t("multiPicker.confirm", { count: selectedIds.length })}
                </Button>
              </div>
            </div>
          }
        >
          <div style={{ padding: 20 }}>
            <AgentPicker selectedIds={selectedIds} onChange={setSelectedIds} />
          </div>
        </Modal>
      )}
    </>
  );
}

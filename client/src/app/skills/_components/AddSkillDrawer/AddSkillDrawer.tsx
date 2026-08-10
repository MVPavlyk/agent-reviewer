/* AddSkillDrawer — Create | Import. Create posts SkillForm's fields straight
   to POST /skills (source: manual). Import is two stateless steps: pick a
   file → POST /skills/import/preview → edit the returned draft in the SAME
   SkillForm → confirm → POST /skills (no drafts table; see
   docs/specs/skills.md "Import API — two steps, but stateless"). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Drawer, Tabs } from "@devdigest/ui";
import { SkillForm, type SkillFormValue } from "../SkillForm";
import { DEFAULT_TYPE } from "../SkillForm/constants";
import { ImportFromFile } from "./_components/ImportFromFile";
import { ImportPreview } from "./_components/ImportPreview";
import {
  useCreateSkill,
  useImportSkillPreview,
  type ImportSkillPreviewResult,
} from "@/lib/hooks/skills";
import { fieldErrors } from "@/lib/form-errors";
import type { AddSkillTab } from "./constants";
import { s } from "./styles";

const EMPTY_FORM: SkillFormValue = { name: "", description: "", type: DEFAULT_TYPE, body: "" };

export function AddSkillDrawer({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const t = useTranslations("skills");
  const create = useCreateSkill();
  const preview = useImportSkillPreview();
  const [tab, setTab] = React.useState<AddSkillTab>("create");
  const [form, setForm] = React.useState<SkillFormValue>(EMPTY_FORM);
  const [importResult, setImportResult] = React.useState<ImportSkillPreviewResult | null>(null);
  // Field-level messages from the LAST failed create/import-confirm — parsed
  // from a 422 so the exact input (not just a toast) shows what's wrong.
  // Cleared on every edit so a stale message can't outlive the fix.
  const [createErrors, setCreateErrors] = React.useState<Record<string, string>>({});
  const [importErrors, setImportErrors] = React.useState<Record<string, string>>({});

  const tabs = [
    { key: "create", label: t("drawer.tabs.create") },
    { key: "import", label: t("drawer.tabs.import") },
  ];

  const submitCreate = async () => {
    try {
      const skill = await create.mutateAsync({ ...form, source: "manual" });
      onCreated(skill.id);
      onClose();
    } catch (err) {
      setCreateErrors(fieldErrors(err));
    }
  };

  const confirmImport = async () => {
    if (!importResult) return;
    try {
      const skill = await create.mutateAsync(importResult.draft);
      onCreated(skill.id);
      onClose();
    } catch (err) {
      setImportErrors(fieldErrors(err));
    }
  };

  return (
    <Drawer
      width={640}
      title={t("drawer.title")}
      subtitle={t("drawer.subtitle")}
      onClose={onClose}
      footer={
        tab === "create" ? (
          <div style={s.footer}>
            <Button kind="ghost" onClick={onClose}>
              {t("form.cancel")}
            </Button>
            <Button
              kind="primary"
              icon="Plus"
              onClick={submitCreate}
              disabled={create.isPending || !form.name.trim()}
            >
              {create.isPending ? t("form.creating") : t("form.create")}
            </Button>
          </div>
        ) : importResult ? (
          <div style={s.footer}>
            <Button kind="ghost" onClick={() => setImportResult(null)}>
              {t("import.cancel")}
            </Button>
            <Button kind="primary" icon="Plus" onClick={confirmImport} disabled={create.isPending}>
              {create.isPending ? t("form.creating") : t("import.confirm")}
            </Button>
          </div>
        ) : null
      }
    >
      <Tabs tabs={tabs} value={tab} onChange={(k) => setTab(k as AddSkillTab)} pad="0 0 16px" />
      {tab === "create" && (
        <SkillForm
          value={form}
          onChange={(v) => {
            setForm(v);
            setCreateErrors({});
          }}
          errors={createErrors}
        />
      )}
      {tab === "import" &&
        (importResult ? (
          <ImportPreview
            result={importResult}
            errors={importErrors}
            onDraftChange={(draft) => {
              setImportResult({ ...importResult, draft: { ...importResult.draft, ...draft } });
              setImportErrors({});
            }}
          />
        ) : (
          <ImportFromFile
            pending={preview.isPending}
            error={preview.isError ? t("drawer.importFailed") : null}
            onFile={async (filename, content_base64) => {
              const result = await preview.mutateAsync({ filename, content_base64 });
              setImportResult(result);
            }}
          />
        ))}
    </Drawer>
  );
}

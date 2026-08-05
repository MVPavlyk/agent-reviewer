/* CreateSkillFromConventionsModal — merges the selected accepted conventions
   into one skill draft (POST /conventions/skill-draft, a stateless preview
   like /skills/import/preview) and lets the user edit everything before
   saving (POST /conventions/create-skill). Reuses FormField/TextInput/
   SelectInput directly rather than the packaged SkillForm — SkillForm renders
   its own `body` field internally with no way to swap it for the merged
   markdown editor. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, Skeleton, SelectInput, TextInput } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { fieldErrors } from "@/lib/form-errors";
import { useConventionSkillDraft, useCreateSkillFromConventions } from "@/lib/hooks/conventions";
import { MergedBodyEditor } from "../MergedBodyEditor";
import { TYPE_OPTIONS } from "./constants";
import { s } from "./styles";

interface DraftForm {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

export function CreateSkillFromConventionsModal({
  repoName,
  conventionIds,
  onClose,
  onCreated,
}: {
  repoName: string;
  conventionIds: string[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useTranslations("conventions");
  const tSkills = useTranslations("skills");
  const draft = useConventionSkillDraft();
  const create = useCreateSkillFromConventions();
  const [form, setForm] = React.useState<DraftForm | null>(null);
  const [draftLoading, setDraftLoading] = React.useState(true);
  const [draftError, setDraftError] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [savedVersion, setSavedVersion] = React.useState<number | null>(null);
  const fetchedOnce = React.useRef(false);

  // Fetch the merge preview exactly once, on open, and seed the editable form
  // straight from the resolved promise. Deliberately NOT reading `draft.data`/
  // `draft.isPending` reactively here: under React StrictMode, a mutation
  // fired from inside a mount effect (`useEffect(fn, [])`, itself double-
  // invoked by StrictMode's mount simulation) does not reliably re-render
  // this component when `useMutation`'s own state settles — the fix is to
  // drive `form`/loading/error off the plain resolved/rejected Promise
  // instead of the hook's reactive fields, since a `useState` setter always
  // triggers a real re-render regardless of that subscription quirk.
  React.useEffect(() => {
    if (fetchedOnce.current) return;
    fetchedOnce.current = true;
    draft
      .mutateAsync(conventionIds)
      .then((data) => {
        setForm({ name: data.name, description: data.description, type: data.type, body: data.body });
        setDraftLoading(false);
      })
      .catch(() => {
        setDraftError(true);
        setDraftLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    if (!form) return;
    try {
      const skill = await create.mutateAsync({ convention_ids: conventionIds, ...form });
      setErrors({});
      setSavedVersion(skill.version);
      setTimeout(onCreated, 700);
    } catch (err) {
      setErrors(fieldErrors(err));
    }
  };

  const filename = `${repoName.split("/").pop() ?? "conventions"}-conventions.md`;

  return (
    <Modal
      width={760}
      title={t("modal.title")}
      subtitle={t("modal.mergedBanner", { count: conventionIds.length, repo: repoName })}
      onClose={onClose}
      footer={
        savedVersion != null ? (
          <div role="status" style={s.savedFooter}>
            {t("modal.savedFooter", { version: savedVersion })}
          </div>
        ) : (
          <div style={s.footer}>
            <Button kind="ghost" onClick={onClose}>
              {t("modal.cancel")}
            </Button>
            <Button kind="primary" icon="Sparkles" disabled={!form || create.isPending} onClick={submit}>
              {create.isPending ? t("modal.creating") : t("modal.create")}
            </Button>
          </div>
        )
      }
    >
      <div style={s.body}>
        {draftLoading && (
          <div style={s.loading}>
            <div style={s.loadingLabel}>{t("modal.loadingDraft")}</div>
            <Skeleton height={38} />
            <Skeleton height={38} />
            <Skeleton height={38} />
            <Skeleton height={160} />
          </div>
        )}
        {draftError && <div style={s.error}>{t("modal.loadError")}</div>}
        {form && (
          <>
            <FormField label={tSkills("form.nameLabel")} required error={errors.name}>
              <TextInput
                value={form.name}
                onChange={(name) => setForm({ ...form, name })}
                invalid={!!errors.name}
              />
            </FormField>
            <FormField label={tSkills("form.descriptionLabel")} error={errors.description}>
              <TextInput
                value={form.description}
                onChange={(description) => setForm({ ...form, description })}
                invalid={!!errors.description}
              />
            </FormField>
            <FormField label={tSkills("form.typeLabel")} error={errors.type}>
              <SelectInput
                value={form.type}
                onChange={(type) => setForm({ ...form, type: type as SkillType })}
                options={TYPE_OPTIONS}
                invalid={!!errors.type}
              />
            </FormField>
            <FormField label={t("modal.bodyLabel")} error={errors.body}>
              <MergedBodyEditor
                filename={filename}
                value={form.body}
                onChange={(body) => setForm({ ...form, body })}
                invalid={!!errors.body}
              />
            </FormField>
          </>
        )}
      </div>
    </Modal>
  );
}

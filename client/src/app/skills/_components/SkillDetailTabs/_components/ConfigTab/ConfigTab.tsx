/* ConfigTab — the Config tab of SkillDetailTabs (moved from the former
   SkillPreviewPane as-is): a selected skill's editable body, enable toggle,
   and metadata badges. Save creates a new immutable version ONLY when the
   body actually changed (server-side rule). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Textarea, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import {
  NeedsVettingBadge,
  SkillSourceBadge,
  SkillTypeBadge,
  needsVetting,
} from "@/components/skill-badges";
import { useUpdateSkill } from "@/lib/hooks/skills";
import { fieldErrors } from "@/lib/form-errors";
import { s } from "./styles";

export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const update = useUpdateSkill();
  const [body, setBody] = React.useState(skill.body);
  const [bodyError, setBodyError] = React.useState<string | undefined>();
  const dirty = body !== skill.body;

  const save = async () => {
    try {
      await update.mutateAsync({ id: skill.id, patch: { body } });
      setBodyError(undefined);
    } catch (err) {
      setBodyError(fieldErrors(err).body);
    }
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div style={s.headerText}>
          <h2 style={s.h2}>{skill.name}</h2>
          <p style={s.description}>{skill.description}</p>
        </div>
        <Toggle
          on={skill.enabled}
          onChange={(enabled) => update.mutate({ id: skill.id, patch: { enabled } })}
          label={`${skill.name} enabled`}
        />
      </div>
      <div style={s.metaRow}>
        <SkillTypeBadge type={skill.type} />
        <SkillSourceBadge source={skill.source} />
        {needsVetting(skill) && <NeedsVettingBadge />}
        <Badge color="var(--text-muted)" mono>
          {t("preview.version", { version: skill.version })}
        </Badge>
      </div>
      {needsVetting(skill) && <div style={s.untrustedNotice}>{t("preview.untrustedNotice")}</div>}
      <div style={s.bodySection}>
        <div style={s.bodyLabel}>{t("preview.bodyLabel")}</div>
        <div style={s.bodyHint}>{t("preview.bodyHint")}</div>
        <Textarea
          value={body}
          onChange={(v) => {
            setBody(v);
            setBodyError(undefined);
          }}
          rows={16}
          mono
          invalid={!!bodyError}
        />
        {bodyError && (
          <div role="alert" style={s.bodyError}>
            {bodyError}
          </div>
        )}
      </div>
      <div style={s.footer}>
        <Button kind="primary" size="sm" disabled={!dirty || update.isPending} onClick={save}>
          {update.isPending ? t("preview.saving") : t("preview.save")}
        </Button>
      </div>
    </div>
  );
}

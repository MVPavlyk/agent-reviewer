"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, SelectInput, TextInput, Textarea } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { TYPE_OPTIONS } from "./constants";
import { s } from "./styles";

export interface SkillFormValue {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

/** Name/description/type/body fields — used by AddSkillDrawer's Create tab AND
 *  ImportPreview (an imported draft is edited through the same fields before
 *  `POST /skills`). The description hint (imperative phrasing) is a product
 *  requirement — pinned by SkillForm.test.tsx.
 *
 *  `errors` maps a field name ("name" | "description" | "type" | "body") to
 *  a server-reported validation message (parsed by `lib/form-errors.ts` from
 *  a 422 response) — so a failed create/update points at the exact field
 *  instead of only a generic toast. */
export function SkillForm({
  value,
  onChange,
  errors,
}: {
  value: SkillFormValue;
  onChange: (v: SkillFormValue) => void;
  errors?: Record<string, string>;
}) {
  const t = useTranslations("skills");
  return (
    <div style={s.body}>
      <FormField label={t("form.nameLabel")} required error={errors?.name}>
        <TextInput
          value={value.name}
          onChange={(name) => onChange({ ...value, name })}
          invalid={!!errors?.name}
        />
      </FormField>
      <FormField
        label={t("form.descriptionLabel")}
        hint={t("form.descriptionHint")}
        error={errors?.description}
      >
        <TextInput
          value={value.description}
          onChange={(description) => onChange({ ...value, description })}
          invalid={!!errors?.description}
        />
      </FormField>
      <FormField label={t("form.typeLabel")} error={errors?.type}>
        <SelectInput
          value={value.type}
          onChange={(type) => onChange({ ...value, type: type as SkillType })}
          options={TYPE_OPTIONS}
          invalid={!!errors?.type}
        />
      </FormField>
      <FormField label={t("form.bodyLabel")} error={errors?.body}>
        <Textarea
          value={value.body}
          onChange={(body) => onChange({ ...value, body })}
          rows={10}
          mono
          invalid={!!errors?.body}
        />
      </FormField>
    </div>
  );
}

"use client";

import { useTranslations } from "next-intl";
import { Chip } from "@devdigest/ui";
import type { BlastRef } from "@/vendor/shared";

interface ImpactChipsProps {
  endpoints: BlastRef[];
  crons: BlastRef[];
}

/** Chips for the endpoints/crons a changed symbol reaches. `title` explains
 *  the path (caller symbol, or "N import hops" for a pure import-graph hit). */
export function ImpactChips({ endpoints, crons }: ImpactChipsProps) {
  const t = useTranslations("blast");

  if (endpoints.length === 0 && crons.length === 0) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
      {endpoints.map((ref) => (
        <Chip key={`endpoint:${ref.value}:${ref.file}`} icon="Globe">
          <span title={refTitle(ref, t)}>{ref.value}</span>
        </Chip>
      ))}
      {crons.map((ref) => (
        <Chip key={`cron:${ref.value}:${ref.file}`} icon="Clock">
          <span title={refTitle(ref, t)}>{ref.value}</span>
        </Chip>
      ))}
    </div>
  );
}

function refTitle(ref: BlastRef, t: ReturnType<typeof useTranslations>): string {
  const via = ref.via_symbol ? `${ref.file} (${ref.via_symbol})` : ref.file;
  if (ref.depth === 0) return via;
  return `${via} — ${t("depth.hops", { count: ref.depth })}`;
}

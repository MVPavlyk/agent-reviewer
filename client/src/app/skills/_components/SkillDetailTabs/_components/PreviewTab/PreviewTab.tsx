/* PreviewTab — renders a skill's body as rendered Markdown, the way it
   actually reads once assembled into a prompt block. Reuses the same
   <Markdown> primitive as FindingCard/CommentCard. */
"use client";

import { Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { s } from "./styles";

export function PreviewTab({ skill }: { skill: Skill }) {
  return (
    <div style={s.wrap}>
      <Markdown>{skill.body}</Markdown>
    </div>
  );
}

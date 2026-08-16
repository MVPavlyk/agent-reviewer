#!/bin/bash
# PreToolUse guard for the doc-writer subagent (.claude/agents/doc-writer.md).
# Blocks Write/Edit outside docs/ trees — never source, never CLAUDE.md, never INSIGHTS.md.
# Input/output contract: https://code.claude.com/docs/en/hooks#pretooluse-input
#
# NOTE: this only runs once the folder containing doc-writer.md has been
# accepted in the workspace-trust dialog. Until then, the subagent still
# runs but this hook is silently skipped — it is not a substitute for
# checking `git status` after delegating to doc-writer for the first time
# in a new checkout. See https://code.claude.com/docs/en/sub-agents
# ("Hooks in subagent frontmatter").

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [[ "$TOOL" != "Write" && "$TOOL" != "Edit" ]]; then
  exit 0
fi

if [[ -z "$FILE" ]]; then
  exit 0
fi

# file_path may arrive absolute or already relative — normalize against the
# project root so the patterns below work either way.
REL="${FILE#"$CLAUDE_PROJECT_DIR"/}"

case "$REL" in
  docs/*|server/docs/*|client/docs/*|reviewer-core/docs/*|e2e/docs/*)
    exit 0
    ;;
  *)
    echo "Blocked: doc-writer may only write under docs/, server/docs/, client/docs/, reviewer-core/docs/, e2e/docs/. Got: $REL" >&2
    exit 2
    ;;
esac

#!/usr/bin/env bash
#
# Append one entry to a package's INSIGHTS.md, under a named section.
#
#   append-insight.sh <package> <section>   # entry on stdin
#
#   printf '%s\n' '- **2026-08-01** — claim — `src/a.ts:12`' \
#     | .claude/skills/engineering-insights/scripts/append-insight.sh server 'Tool & Library Notes'
#
# Guarantees, so the agent doesn't have to remember them:
#   - append-only: aborts if any pre-existing line would change or disappear
#   - the entry lands at the END of the named section, not the end of the file
#   - unknown package or section is an error listing the valid ones
#   - the entry must start with `- **YYYY-MM-DD** — `
#
set -euo pipefail

readonly PACKAGES=(client server reviewer-core e2e mcp)

die() { printf 'append-insight: %s\n' "$*" >&2; exit 1; }

[ $# -eq 2 ] || die "usage: append-insight.sh <package> <section>   (entry on stdin)
  packages: ${PACKAGES[*]}"

pkg=$1
section=$2

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# scripts/ -> engineering-insights/ -> skills/ -> .claude/ -> repo root
repo_root=$(cd -- "$script_dir/../../../.." && pwd)

known=false
for p in "${PACKAGES[@]}"; do [ "$p" = "$pkg" ] && known=true; done
$known || die "unknown package '$pkg'. Valid: ${PACKAGES[*]}"

file="$repo_root/$pkg/INSIGHTS.md"
[ -f "$file" ] || die "$file does not exist. Create it from the skeleton in SKILL.md first."

entry=$(cat)
[ -n "${entry//[[:space:]]/}" ] || die "empty entry on stdin — nothing to append."

first_line=${entry%%$'\n'*}
if ! printf '%s' "$first_line" | grep -qE '^- \*\*[0-9]{4}-[0-9]{2}-[0-9]{2}\*\* '; then
  die "entry must start with '- **YYYY-MM-DD** — '. Got:
  $first_line"
fi

start=$(grep -n "^## ${section}\$" "$file" | head -1 | cut -d: -f1 || true)
if [ -z "$start" ]; then
  die "section '## $section' not found in $pkg/INSIGHTS.md. Available:
$(grep '^## ' "$file" | sed 's/^## /  /')"
fi

total=$(wc -l < "$file" | tr -d ' ')

# First heading after the section starts; EOF if none.
next=$(awk -v s="$start" 'NR > s && /^## / { print NR; exit }' "$file")
[ -n "$next" ] || next=$((total + 1))

# Insert after the last non-blank line of the section (the heading itself when empty),
# so trailing blank lines before the next heading are preserved.
ins=$(awk -v s="$start" -v n="$next" \
  'NR >= s && NR < n && $0 ~ /[^[:space:]]/ { last = NR } END { print last }' "$file")

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

head -n "$ins" "$file" > "$tmp"
printf '%s\n' "$entry" >> "$tmp"
tail -n +"$((ins + 1))" "$file" >> "$tmp"

# Append-only assertion: a pure insertion produces no '<' lines in diff output.
if diff "$file" "$tmp" | grep -q '^<'; then
  die "refusing to write — the change would modify or remove existing lines.
  This is a bug in the script, not something to work around by hand-editing."
fi

cat "$tmp" > "$file"
printf 'appended to %s/INSIGHTS.md under "## %s"\n' "$pkg" "$section"

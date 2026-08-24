#!/usr/bin/env bash
#
# verify-l06.sh — one-command gate for the eval-pipeline feature (SPEC-05, L-06).
#
#   pnpm verify:l06     # run from server/ (aliased in server/package.json)
#
# Runs, in order (AC-77):
#   1. typecheck: server, client, reviewer-core
#   2. reviewer-core unit tests (score()/match() — the pure scoring engine)
#   3. server eval-route tests (unit + integration, run separately — R-3:
#      a full `vitest run` can silently *skip* .it.test.ts files instead of
#      failing when Docker is unavailable; this script always prints how many
#      integration files were skipped so a green run can't be mistaken for a
#      verified one)
#   4. client tests
#   5. static import check: reviewer-core/src/eval/** must never import
#      llm/, openai, @anthropic-ai/sdk, postgres, or drizzle (D-5, AC-33/40).
#      This checks import SPECIFIERS ( from '...' / require('...') / import
#      '...' ), not bare substring occurrences — score.ts's own doc-comment
#      names these same words to explain the rule, and a bare grep would
#      false-positive on that comment. Do not remove the comment; it is what
#      explains the rule to the next reader.
#
# Requires node/pnpm/npm on PATH. This shell has none by default — see the
# NODE_BIN preamble in the root CLAUDE.md ("No system Node in the agent
# shell") and export it before invoking this script:
#
#   NODE_BIN="$(dirname "$(find "$HOME/Library/Application Support/JetBrains"/WebStorm*/node/versions/*/bin/node 2>/dev/null | head -1)")"
#   export PATH="$NODE_BIN:$PATH"
#
# Package managers are NOT interchangeable: server/ and client/ use pnpm,
# reviewer-core/ uses npm (`pnpm install` inside reviewer-core/ creates a
# stray lockfile and breaks CI).
#
# NOTE on error handling: this script checks each step's exit code
# explicitly (`run_step`) instead of relying on `trap ... ERR`. macOS ships
# bash 3.2, and under 3.2 an ERR trap set in the top-level script does not
# reliably fire when the failing command is a `( cd dir && cmd )` subshell —
# it silently exits via `set -e` without ever invoking the trap. Explicit
# `if ! ( ... ); then fail "$STEP"; fi` is what actually works on that bash.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log() { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }

fail() {
  echo "" >&2
  echo "✗ verify:l06 FAILED at step: $1" >&2
  exit 1
}

# run_step <step-label> <command...> — runs the command; on nonzero exit,
# prints the step label and exits nonzero. Explicit check, not a trap (see
# NOTE above).
run_step() {
  local step="$1"
  shift
  log "$step"
  if ! "$@"; then
    fail "$step"
  fi
}

# --- Step 1: typecheck (server, client, reviewer-core) -----------------------
run_step "1/5 typecheck (server)" bash -c "cd '$ROOT/server' && pnpm typecheck"
run_step "1/5 typecheck (client)" bash -c "cd '$ROOT/client' && pnpm typecheck"
run_step "1/5 typecheck (reviewer-core)" bash -c "cd '$ROOT/reviewer-core' && npm run typecheck"

# --- Step 2: reviewer-core unit tests (scoring engine) ------------------------
run_step "2/5 reviewer-core unit tests (npm test)" bash -c "cd '$ROOT/reviewer-core' && npm test"

# --- Step 3: server eval-route tests (unit + integration, separately) --------
run_step "3/5 server eval tests — unit (vitest run, excluding .it.test.ts)" \
  bash -c "cd '$ROOT/server' && pnpm exec vitest run --exclude '**/*.it.test.ts'"

IT_COUNT="$(find "$ROOT/server/test" -name '*.it.test.ts' | wc -l | tr -d ' ')"
log "found ${IT_COUNT} *.it.test.ts file(s) under server/test — running now (they self-skip if Docker is unavailable; a skip is NOT a pass, see below)"
run_step "3/5 server eval tests — integration (.it.test)" \
  bash -c "cd '$ROOT/server' && pnpm exec vitest run .it.test"
log "NOTE: if Docker was unavailable, the ${IT_COUNT} integration file(s) above were SKIPPED, not verified. A green exit code here does not by itself prove the integration suite ran — check the vitest output above for 'skipped' counts."

# --- Step 4: client tests -----------------------------------------------------
run_step "4/5 client tests (pnpm test)" bash -c "cd '$ROOT/client' && pnpm test"

# --- Step 5: static import check on reviewer-core/src/eval/** ----------------
STEP5="5/5 static import check (reviewer-core/src/eval/** forbidden imports)"
log "$STEP5"
EVAL_DIR="$ROOT/reviewer-core/src/eval"
# Match only actual import/require specifiers, not bare word occurrences —
# a bare grep on these words would false-positive on score.ts's own
# doc-comment that names them to explain this exact rule.
FORBIDDEN_PATTERN="^[[:space:]]*(import|export)[^;]*from[[:space:]]+['\"](llm/|openai|@anthropic-ai/sdk|postgres|drizzle)|require\\(['\"](llm/|openai|@anthropic-ai/sdk|postgres|drizzle)|^[[:space:]]*import[[:space:]]+['\"](llm/|openai|@anthropic-ai/sdk|postgres|drizzle)"
if grep -rnE "$FORBIDDEN_PATTERN" "$EVAL_DIR"; then
  echo "forbidden import found in reviewer-core/src/eval/** (see above)" >&2
  fail "$STEP5"
fi
log "no forbidden import specifiers found in reviewer-core/src/eval/**"

echo ""
echo "✓ verify:l06 passed — all 5 steps green"

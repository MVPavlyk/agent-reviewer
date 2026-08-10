# Skills control experiment — RESULTS

Run at: 2026-08-03T18:00:10.744Z
Agent: **API Contract Reviewer** · Skill: **Response Schema Stability** (toggled via `skills.enabled`, link kept intact)

> **Caveat — read before trusting these numbers.** This is a demonstration, n=1 per cell, against a non-deterministic model (no `temperature: 0` — the OpenRouter adapter did not expose it at the time this ran). It is **not** a statistically valid eval. A single run can go either way on a borderline finding; treat `prompt_assembly.skills` presence/absence as the one reliable, deterministic signal (a pipeline fact, not model judgment) — the verdict/finding/`tokens_in` columns are one sample each, not proof, and `tokens_in` in particular turned out **not** to be a clean signal here (see Interpretation below).

| Diff | Skills | Run id | Status | Verdict | Findings | tokens_in | cost_usd | skills in prompt_assembly |
|---|---|---|---|---|---|---|---|---|
| Happy path (additive, no contract break) | off | `4f1a1951-4a3f-4e9a-854f-ad1a8920f1b2` | done | approve | 0 | 2968 | 0.00045453 | false |
| Happy path (additive, no contract break) | ON | `a7af7baf-141d-4e2b-b6a2-f5ee540dfff6` | done | approve | 0 | 1732 | 0.000355904 | true |
| Route signature change (field removed, no version bump) | off | `b98c02ef-f68e-456a-b803-3468b5a1933c` | done | request_changes | 1 | 1517 | 0.0002283498 | false |
| Route signature change (field removed, no version bump) | ON | `4df449a5-3dbe-4346-8a84-dfdb0378defb` | done | request_changes | 1 | 2933 | 0.000514439 | true |

## Happy path (additive, no contract break)

### skills OFF
- Verdict: **approve**, 0 finding(s)
- `prompt_assembly.skills` present: **false**
- tokens_in: 2968, tokens_out: 151, cost_usd: 0.00045453

### skills ON
- Verdict: **approve**, 0 finding(s)
- `prompt_assembly.skills` present: **true**
- tokens_in: 1732, tokens_out: 462, cost_usd: 0.000355904

## Route signature change (field removed, no version bump)

### skills OFF
- Verdict: **request_changes**, 1 finding(s)
  - Removed response field `deletedAt` from PullSummary
- `prompt_assembly.skills` present: **false**
- tokens_in: 1517, tokens_out: 536, cost_usd: 0.0002283498

### skills ON
- Verdict: **request_changes**, 1 finding(s)
  - Removed `deletedAt` field from PullSummary response breaks existing callers
- `prompt_assembly.skills` present: **true**
- tokens_in: 2933, tokens_out: 384, cost_usd: 0.000514439

## Interpretation

This ran for real against `openrouter/deepseek/deepseek-v4-flash` (a configured
`OPENROUTER_API_KEY` was available in this environment) — not a mock. Two
honest findings, one clean and one that complicates the "no skills → miss"
story:

1. **The pipeline mechanism is unambiguous.** The `skills in prompt_assembly`
   column is exactly `false`/`true`/`false`/`true` across the four runs,
   matching the `skills.enabled` toggle in every cell. This is the acceptance
   criterion from PR 2 (`review-skills.it.test.ts`) reproduced against a real
   model call instead of a mock — the enabled skill reached the prompt as its
   own block, and disabling it (link intact) removed the section, exactly as
   designed.
2. **The verdict did NOT change** on the route-signature-change diff (both
   cells: `request_changes`, 1 finding, citing the removed `deletedAt` field).
   This is because `API Contract Reviewer`'s own system prompt (written for
   this same L-02 course lesson) already instructs it to flag exactly this
   pattern — the linked skill reinforces an existing instruction rather than
   filling a gap. A more dramatic "miss vs. catch" demonstration would pair
   this skill with a *generic* agent whose prompt says nothing about contract
   shape (e.g. `General Reviewer`) — left as a follow-up, not run here to keep
   this experiment to the two agents the seed actually links the skill to.
3. **`tokens_in` is not a reliable per-cell signal in practice**, despite the
   caveat above assuming it would be: it went *down* (2968 → 1732) on the
   happy-path diff when the skill was enabled, even though the skill block is
   strictly additional text in `assemblePrompt` (verified deterministically by
   `skills-prompt-blocks.test.ts` — the assembled string is longer with the
   skill present, always). The most likely explanation is provider-side prompt
   caching on OpenRouter/DeepSeek giving a partial cache-hit discount on the
   second of two back-to-back calls sharing most of the same prefix — not a
   defect in this feature. The route-signature-change diff's tokens_in *did*
   increase as expected (1517 → 2933), consistent with that theory (its two
   calls were further apart in the run sequence). **Use
   `prompt_assembly.skills` presence, not `tokens_in`, as the ground truth for
   "did the skill reach the prompt."**


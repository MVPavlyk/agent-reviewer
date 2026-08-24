import type { Container } from '../../platform/container.js';
import type { Provider } from '@devdigest/shared';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import {
  reviewPullRequest,
  score,
  type MatchTarget,
  type EvalCaseScoreInput,
  type ExpectedFinding,
  type SourceFindingZone,
} from '@devdigest/reviewer-core';
import type { EvalsRepository, EvalCaseRow, EvalRunBatchRow } from './repository.js';

/** Minimal pino-compatible logger — avoids importing reviews' Logger type across modules. */
export type BatchExecutorLogger = {
  info: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

interface CaseOutcome {
  caseId: string;
  runId: string;
  ok: boolean;
  findings: MatchTarget[];
  kept: number;
  dropped: number;
  costUsd: number | null;
  durationMs: number;
  error?: string;
}

/**
 * Runs every case of an eval batch (Крок 10, SPEC-05).
 *
 * Sequential (OQ-1), against a FROZEN snapshot of the agent's config —
 * `batch.systemPromptSnapshot`/`batch.model`/`batch.provider` are never
 * re-read from `agents` mid-run (AC-22). `expected_output` is NEVER passed
 * into `reviewPullRequest` (AC-84); scoring happens only after the model
 * call returns, via reviewer-core's pure `score()`/`match()`. Never writes
 * to `reviews`, `findings`, or `agent_runs` (D-6) — this batch is a
 * throwaway harness run, not a product review. One aggregate UPDATE at the
 * end (NFR-1) — no on-the-fly metric computation for readers.
 */
export class EvalBatchExecutor {
  constructor(
    private container: Container,
    private repo: EvalsRepository,
  ) {}

  async run(
    batch: EvalRunBatchRow,
    cases: EvalCaseRow[],
    skillBodies: string[],
    logger?: BatchExecutorLogger,
  ): Promise<void> {
    const started = Date.now();

    let llm;
    try {
      llm = await this.container.llm(batch.provider as Provider);
    } catch (err) {
      // Provider unavailable → every case fails identically; still one row
      // each so the UI can show "N cases ran, all errored" instead of nothing.
      await this.finishAllFailed(batch, cases, (err as Error).message, started);
      return;
    }

    const outcomes: CaseOutcome[] = [];
    for (const c of cases) {
      const caseStart = Date.now();
      try {
        const path = Array.isArray(c.inputFiles) ? (c.inputFiles[0] as string | undefined) : undefined;
        if (!c.inputDiff || !path) throw new Error('Eval case has no input diff');

        // `input_diff` (Крок 8/AC-12) is the raw hunk text only — wrap it the
        // same way `hunk-slice.ts` derives it so `parseUnifiedDiff` sees a
        // complete single-file diff (AC-83).
        const wrapped = `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n${c.inputDiff}`;
        const diff = parseUnifiedDiff(wrapped);

        const outcome = await reviewPullRequest({
          systemPrompt: batch.systemPromptSnapshot,
          model: batch.model,
          diff,
          llm,
          // NEVER: intent, repoMap, callers, memory, specs, prDescription (AC-25).
          ...(skillBodies.length ? { skills: skillBodies } : {}),
        });

        const costUsd =
          outcome.costUsd ?? this.container.priceBook.estimate(batch.model, outcome.tokensIn, outcome.tokensOut);
        const durationMs = Date.now() - caseStart;

        // Write the row as soon as this case finishes so /eval-runs/:batchId's
        // completed_cases can advance mid-batch instead of jumping 0 → N at the
        // very end (fix-plan-4). Scoring (pass/classification/unmatched_count)
        // is batch-level — it needs totals across every case — so this row
        // starts with pass: null and finishBatch UPDATEs it below, never
        // inserting a second row for the same case.
        const run = await this.repo.insertRun({
          caseId: c.id,
          batchId: batch.id,
          actualOutput: { findings: outcome.review.findings },
          pass: null,
          durationMs,
          costUsd,
        });

        outcomes.push({
          caseId: c.id,
          runId: run.id,
          ok: true,
          findings: outcome.review.findings,
          kept: outcome.review.findings.length,
          dropped: outcome.dropped.length,
          costUsd,
          durationMs,
        });
      } catch (err) {
        logger?.error({ caseId: c.id, batchId: batch.id, err: (err as Error).message }, 'eval batch: case failed');
        const durationMs = Date.now() - caseStart;
        const run = await this.repo.insertRun({
          caseId: c.id,
          batchId: batch.id,
          actualOutput: { error: (err as Error).message },
          pass: null,
          durationMs,
          costUsd: null,
        });
        outcomes.push({
          caseId: c.id,
          runId: run.id,
          ok: false,
          findings: [],
          kept: 0,
          dropped: 0,
          costUsd: null,
          durationMs,
          error: (err as Error).message,
        });
      }
    }

    await this.finishBatch(batch, cases, outcomes, started);
  }

  /** Provider resolution itself failed — every case gets an identical error row. */
  private async finishAllFailed(
    batch: EvalRunBatchRow,
    cases: EvalCaseRow[],
    message: string,
    started: number,
  ): Promise<void> {
    for (const c of cases) {
      await this.repo.insertRun({
        caseId: c.id,
        batchId: batch.id,
        actualOutput: { error: message },
        pass: null,
        durationMs: 0,
        costUsd: null,
      });
    }
    await this.repo.updateBatch(batch.workspaceId, batch.id, {
      status: 'failed',
      recall: null,
      precision: null,
      citationAccuracy: null,
      costUsd: null,
      tracesPassed: 0,
      tracesTotal: cases.length,
      durationMs: Date.now() - started,
      error: message,
      finishedAt: new Date(),
    });
  }

  private async finishBatch(
    batch: EvalRunBatchRow,
    cases: EvalCaseRow[],
    outcomes: CaseOutcome[],
    started: number,
  ): Promise<void> {
    const byId = new Map(cases.map((c) => [c.id, c]));
    const successes = outcomes.filter((o) => o.ok);
    const failures = outcomes.filter((o) => !o.ok);

    const scoreCases: EvalCaseScoreInput[] = successes.map((o) => {
      const c = byId.get(o.caseId)!;
      const meta = c.inputMeta as { source_finding?: SourceFindingZone } | null;
      return {
        caseId: o.caseId,
        expectedOutput: (c.expectedOutput as ExpectedFinding[] | null) ?? [],
        sourceFinding: meta?.source_finding ?? null,
        findings: o.findings,
      };
    });

    const totalKept = successes.reduce((n, o) => n + o.kept, 0);
    const totalDropped = successes.reduce((n, o) => n + o.dropped, 0);
    const result = score({ cases: scoreCases, kept: totalKept, dropped: totalDropped });
    const resultById = new Map(result.cases.map((r) => [r.caseId, r]));

    for (const o of outcomes) {
      // Row already exists (written mid-loop in run() above) — update it with
      // the final score rather than inserting a second row for the same case.
      if (!o.ok) continue;
      const r = resultById.get(o.caseId)!;
      await this.repo.updateRun(o.runId, {
        actualOutput: {
          findings: o.findings,
          classification: r.classification,
          unmatched_count: r.unmatchedCount,
        },
        pass: r.pass,
      });
    }

    // Sum resolved per-case costs; `null` only when EVERY successful case had
    // no cost info at all (never coerced to 0 — server/INSIGHTS.md 2026-08-01).
    const costs = successes.map((o) => o.costUsd);
    const costUsd = costs.every((c) => c == null) ? null : costs.reduce<number>((n, c) => n + (c ?? 0), 0);

    let status: 'succeeded' | 'partial' | 'failed';
    if (failures.length === 0) status = 'succeeded';
    else if (successes.length === 0) status = 'failed';
    else status = 'partial';

    await this.repo.updateBatch(batch.workspaceId, batch.id, {
      status,
      recall: status === 'failed' ? null : result.recall,
      precision: status === 'failed' ? null : result.precision,
      citationAccuracy: status === 'failed' ? null : result.citationAccuracy,
      costUsd: status === 'failed' ? null : costUsd,
      tracesPassed: result.cases.filter((c) => c.pass).length,
      tracesTotal: cases.length,
      durationMs: Date.now() - started,
      error: status === 'failed' ? (failures[0]?.error ?? 'all cases failed') : null,
      finishedAt: new Date(),
    });
  }
}

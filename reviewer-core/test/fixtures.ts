import type {
  CompletionRequest,
  CompletionResult,
  LLMProvider,
  ModelInfo,
  StructuredRequest,
  StructuredResult,
  UnifiedDiff,
} from '@devdigest/shared';

/**
 * Local reviewer-core test doubles. `reviewer-core` must never import a
 * runtime value from `server/` (`reviewer-core ↛ both` — root CLAUDE.md's
 * import-direction rule; the package's only sanctioned cross-package coupling
 * is TYPES via the `@devdigest/shared` tsconfig path). Mirrors the shape of
 * server's `MockLLMProvider`/`MockGitClient` closely enough for engine tests,
 * without the dependency.
 */

export interface MockLLMOptions {
  structured?: unknown;
}

/** Minimal `LLMProvider` stub: `completeStructured` always returns `opts.structured`. */
export class MockLLMProvider implements LLMProvider {
  readonly id: 'openai' | 'anthropic';

  constructor(
    id: 'openai' | 'anthropic' = 'openai',
    private opts: MockLLMOptions = {},
  ) {
    this.id = id;
  }

  async listModels(): Promise<ModelInfo[]> {
    return [];
  }

  async complete(_req: CompletionRequest): Promise<CompletionResult> {
    throw new Error('MockLLMProvider.complete is not used by these tests');
  }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    return {
      data: (this.opts.structured ?? {}) as T,
      model: req.model,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      raw: '',
      attempts: 1,
    };
  }

  async embed(_texts: string[]): Promise<number[][]> {
    return [];
  }
}

/**
 * The engine tests' default diff: one hunk in `src/config.ts` covering new
 * lines 10-13 (matches server's `MockGitClient` default fixture — a Stripe
 * key added at line 11 — so grounding drops the line-999 hallucinated finding
 * and keeps the line-11 one, same as before this file stopped importing
 * server's mocks).
 */
export const FIXTURE_DIFF: UnifiedDiff = {
  raw: '',
  files: [
    {
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      hunks: [
        {
          file: 'src/config.ts',
          oldStart: 10,
          oldLines: 3,
          newStart: 10,
          newLines: 4,
          newLineNumbers: [10, 11, 12, 13],
        },
      ],
    },
  ],
};

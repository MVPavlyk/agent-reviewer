import type { CiExportInput, CiFile } from '@devdigest/shared';
import { MEMORY_PATH, RUNNER_ENTRY_PATH } from './constants.js';
import { buildManifestBundle, type AgentForManifest, type SkillForManifest } from './manifest.js';
import { buildWorkflowFile, type WorkflowIngestConfig } from './workflow.js';

/**
 * A4 — assembles the full export bundle (SPEC-05 D-3): manifest + skill
 * bodies + workflow + the runner bundle + a memory export. ADDENDUM v2
 * decision 3 re-includes `.devdigest/memory.jsonl` (v1 excluded it).
 */

/** Plain, already-resolved memory entry (repository row → this shape happens
 *  in service.ts, keeping this module DB-free per onion-architecture). */
export interface MemoryEntryForExport {
  kind: string;
  scope: string;
  content: string;
  confidence: number | null;
  createdAt: string;
}

/** One JSON object per line — never parsed/eval'd by us, just serialized. */
export function buildMemoryFile(entries: MemoryEntryForExport[]): CiFile {
  const lines = entries.map((e) =>
    JSON.stringify({
      kind: e.kind,
      scope: e.scope,
      content: e.content,
      confidence: e.confidence,
      created_at: e.createdAt,
    }),
  );
  return {
    path: MEMORY_PATH,
    contents: lines.join('\n'),
    editable: false,
  };
}

export interface BuildBundleInput {
  agent: AgentForManifest;
  skills: SkillForManifest[];
  triggers: CiExportInput['triggers'];
  postAs: CiExportInput['post_as'];
  /** Contents of the already-built `agent-runner/dist/index.js` (AC-9). */
  runnerBundleContents: string;
  /** ADDENDUM v2 decision 3 — minimal memory export (may be empty). */
  memoryEntries: MemoryEntryForExport[];
  /** ADDENDUM v2 — ingest auth contract; when omitted, no ingest step is
   *  emitted (kept optional so existing callers/tests that don't care about
   *  ingest still compile). */
  ingest?: WorkflowIngestConfig;
}

export function buildBundleFiles(input: BuildBundleInput): CiFile[] {
  const { manifestFile, skillFiles } = buildManifestBundle(input.agent, input.skills);
  const workflowFile = buildWorkflowFile({
    triggers: input.triggers,
    postAs: input.postAs,
    ingest: input.ingest,
  });
  const memoryFile = buildMemoryFile(input.memoryEntries);
  const runnerFile: CiFile = {
    path: RUNNER_ENTRY_PATH,
    contents: input.runnerBundleContents,
    // Compiled artifact — editing it in the target repo would silently drift
    // from what the studio generates; not meant to be hand-edited like the
    // manifest/workflow.
    editable: false,
  };

  return [manifestFile, ...skillFiles, memoryFile, workflowFile, runnerFile];
}

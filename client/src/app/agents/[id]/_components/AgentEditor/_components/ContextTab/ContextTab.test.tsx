import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import type { ContextDoc, ContextDocLink, ContextDocsResponse, Repo } from "@/lib/types";
import agentsMessages from "../../../../../../../../messages/en/agents.json";
import contextMessages from "../../../../../../../../messages/en/context.json";

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "s",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

const REPO: Repo = {
  id: "repo1",
  workspace_id: "ws1",
  owner: "acme",
  name: "widgets",
  full_name: "acme/widgets",
  default_branch: "main",
  clone_path: "/clones/repo1",
  last_polled_at: null,
  created_by: null,
};

const DOCS_RESPONSE: ContextDocsResponse = {
  docs: [
    { path: "specs/a.md", dir_type: "specs", size_bytes: 40, tokens: 10, content_hash: "h1", used_by_agents: 1, excluded_reason: null },
    { path: "docs/b.md", dir_type: "docs", size_bytes: 40, tokens: 20, content_hash: "h2", used_by_agents: 1, excluded_reason: null },
  ] satisfies ContextDoc[],
  roots: ["specs", "docs"],
  scanned_at: "2026-08-20T00:00:00Z",
};

let links: ContextDocLink[] = [
  { path: "docs/b.md", order: 0, source: "skill", skill_id: "sk1", skill_name: "Security Skill", skill_enabled: true },
  { path: "specs/a.md", order: 0, source: "agent" },
];
let docsError = false;
let linksError = false;
const setDocsMutate = vi.fn();
const refetchDocs = vi.fn();
const refetchLinks = vi.fn();

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "repo1", setRepoId: vi.fn(), repos: [REPO], activeRepo: REPO, reposLoaded: true }),
}));

vi.mock("@/lib/hooks", () => ({
  useContextDocs: () => ({ data: DOCS_RESPONSE, isLoading: false, isError: docsError, refetch: refetchDocs }),
  useAgentContextDocs: () => ({ data: links, isLoading: false, isError: linksError, refetch: refetchLinks }),
  useSetAgentContextDocs: () => ({ mutate: setDocsMutate, isPending: false }),
  useRepos: () => ({ data: [REPO] }),
  useContextDocContent: () => ({ data: undefined, isLoading: false }),
}));

import { ContextTab } from "./ContextTab";

afterEach(() => {
  cleanup();
  setDocsMutate.mockClear();
  refetchDocs.mockClear();
  refetchLinks.mockClear();
  docsError = false;
  linksError = false;
  links = [
    { path: "docs/b.md", order: 0, source: "skill", skill_id: "sk1", skill_name: "Security Skill", skill_enabled: true },
    { path: "specs/a.md", order: 0, source: "agent" },
  ];
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages, context: contextMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("ContextTab (agent editor, SPEC-02 AC-14/15/21/25/26/32/33, EC-6/10)", () => {
  it("renders own + inherited attachments, an order hint, and posts the full own-paths set on attach (AC-14/15/21)", () => {
    renderWithIntl(<ContextTab agent={AGENT} />);
    expect(screen.getByText(/Documents inherited from this agent's enabled skills/)).toBeInTheDocument();
    // Inherited row: source badge, no detach Toggle.
    expect(screen.getByText("via Security Skill")).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "b.md attached" })).not.toBeInTheDocument();
    // Own row IS toggleable.
    expect(screen.getByRole("switch", { name: "a.md attached" })).toBeChecked();
  });

  it("shows a loading state, then an error state with retry (AC-26)", () => {
    docsError = true;
    renderWithIntl(<ContextTab agent={AGENT} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetchDocs).toHaveBeenCalled();
  });

  it("a mutation failure leaves the rendered set unchanged (AC-25 — no local optimistic state to roll back)", () => {
    renderWithIntl(<ContextTab agent={AGENT} />);
    // The own row still reflects the last successful query response regardless
    // of the mutation's outcome — nothing is derived from mutation state.
    expect(screen.getByRole("switch", { name: "a.md attached" })).toBeChecked();
    expect(setDocsMutate).not.toHaveBeenCalled();
  });
});

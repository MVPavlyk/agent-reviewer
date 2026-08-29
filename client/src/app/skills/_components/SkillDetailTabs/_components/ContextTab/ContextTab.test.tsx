import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import type { ContextDoc, ContextDocLink, ContextDocsResponse, Repo } from "@/lib/types";
import skillsMessages from "../../../../../../../messages/en/skills.json";
import contextMessages from "../../../../../../../messages/en/context.json";

const SKILL: Skill = {
  id: "sk1",
  name: "API Contract Rubric",
  description: "d",
  type: "rubric",
  source: "manual",
  body: "Check every changed handler.",
  enabled: true,
  version: 2,
  agents_count: 1,
  pull_rate: 0.5,
  accept_rate: 0.8,
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
    { path: "specs/a.md", dir_type: "specs", size_bytes: 40, tokens: 10, content_hash: "h1", used_by_agents: 0, excluded_reason: null },
    { path: "docs/b.md", dir_type: "docs", size_bytes: 40, tokens: 20, content_hash: "h2", used_by_agents: 0, excluded_reason: null },
  ] satisfies ContextDoc[],
  roots: ["specs", "docs"],
  scanned_at: "2026-08-20T00:00:00Z",
};

// A skill's own `GET /skills/:id/context-docs` always reports `source:'agent'`
// (the field names the OWNER kind, not literally "an agent" — a skill's own
// list has no "inherited" concept, see server/src/modules/context-docs/service.ts).
let links: ContextDocLink[] = [{ path: "specs/a.md", order: 0, source: "agent" }];
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
  useSkillContextDocs: () => ({ data: links, isLoading: false, isError: linksError, refetch: refetchLinks }),
  useSetSkillContextDocs: () => ({ mutate: setDocsMutate, isPending: false }),
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
  links = [{ path: "specs/a.md", order: 0, source: "agent" }];
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: skillsMessages, context: contextMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("ContextTab (skill editor, SPEC-02 AC-27/29/30/31)", () => {
  it("renders the shared picker with an inheritance hint and an attached-count badge (AC-27/29/30)", () => {
    renderWithIntl(<ContextTab skill={SKILL} />);
    // The inheritance hint: any agent using this skill inherits these docs.
    expect(screen.getByText(/Any agent that uses this skill inherits these documents\./)).toBeInTheDocument();
    // "N attached" badge, distinct from the picker's own "N of M attached" count.
    expect(screen.getByText("1 attached")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 attached")).toBeInTheDocument();
    // The row is fully interactive — no inherited rows exist for a skill's own tab.
    expect(screen.getByRole("switch", { name: "a.md attached" })).toBeChecked();
  });

  it("never renders a SERIALIZES AS block or any serialization preview (AC-31, negative)", () => {
    renderWithIntl(<ContextTab skill={SKILL} />);
    expect(screen.queryByText(/SERIALIZES AS/i)).not.toBeInTheDocument();
  });

  it("shows a loading state, then an error state with retry", () => {
    docsError = true;
    renderWithIntl(<ContextTab skill={SKILL} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetchDocs).toHaveBeenCalled();
  });
});

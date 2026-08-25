import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import ciMessages from "../../../../../../messages/en/ci.json";

// client/INSIGHTS.md 2026-08-11: mock `@/lib/hooks/ci` directly (not the
// `@/lib/hooks` barrel) so each test can vary `data`/`isLoading` per-call.
const { useAgentCiMock } = vi.hoisted(() => ({ useAgentCiMock: vi.fn() }));
vi.mock("@/lib/hooks/ci", () => ({
  useAgentCi: useAgentCiMock,
  // The wizard this tab mounts (ExportWizard) also calls `useExportCi` —
  // stubbed here so opening it from the empty-state CTA doesn't crash.
  useExportCi: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("@/lib/hooks/agents", () => ({ useUpdateAgent: () => ({ mutate, isPending: false }) }));

// The wizard's Target step lists integrated repos via useRepos — stub it so
// opening the wizard from this tab doesn't need a QueryClient.
vi.mock("@/lib/hooks/core", () => ({
  useRepos: () => ({ data: [{ id: "1", full_name: "acme/repo" }], isLoading: false }),
}));

import { CITab } from "./CITab";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ ci: ciMessages }}>{ui}</NextIntlClientProvider>);
}

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

describe("CITab (SPEC-06 Pass 8, ADDENDUM v2 item 4)", () => {
  it("loading state renders a skeleton, not the empty state or installations (AC-10)", () => {
    useAgentCiMock.mockReturnValue({ data: undefined, isLoading: true });
    renderWithIntl(<CITab agent={AGENT} />);
    expect(screen.queryByText(/not deployed to ci yet/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add repository/i })).not.toBeInTheDocument();
  });

  it("empty state shows a single '+ Add to CI' CTA and no 'Active in N repos' pill (AC-11/EC-1)", () => {
    useAgentCiMock.mockReturnValue({ data: [], isLoading: false });
    renderWithIntl(<CITab agent={AGENT} />);
    expect(screen.getByText(/not deployed to ci yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/active in/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add to ci/i }));
    // Opens the wizard (Target step) — mounts without crashing.
    expect(screen.getByText("Export to CI")).toBeInTheDocument();
  });

  it("shows N installations with workflow version, PR link, and neutral status when there is no run yet (AC-5/AC-7/AC-12/EC-2)", () => {
    useAgentCiMock.mockReturnValue({
      data: [
        {
          installation: {
            id: "inst1",
            agent_id: "ag1",
            repo: "acme/repo-a",
            target_type: "gha",
            installed_at: "2026-08-20T00:00:00Z",
            workflow_version: "3",
            pr_url: "https://github.com/acme/repo-a/pull/9",
          },
          last_run: null,
          runs: [],
        },
      ],
      isLoading: false,
    });
    renderWithIntl(<CITab agent={AGENT} />);

    expect(screen.getByText("Active in 1 repo")).toBeInTheDocument();
    expect(screen.getByText("acme/repo-a")).toBeInTheDocument();
    expect(screen.getByText("GitHub Actions")).toBeInTheDocument();
    expect(screen.getByText("Not run yet")).toBeInTheDocument();
    expect(screen.getByText("workflow v3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view pr/i })).toHaveAttribute(
      "href",
      "https://github.com/acme/repo-a/pull/9",
    );
    expect(screen.getByText(/no runs yet/i)).toBeInTheDocument();
  });

  it("clicking a Fail CI on option patches the agent via useUpdateAgent (AC-6)", () => {
    useAgentCiMock.mockReturnValue({ data: [], isLoading: false });
    renderWithIntl(<CITab agent={AGENT} />);
    fireEvent.click(screen.getByRole("button", { name: "Never" }));
    expect(mutate).toHaveBeenCalledWith({ id: "ag1", patch: { ci_fail_on: "never" } });
  });
});

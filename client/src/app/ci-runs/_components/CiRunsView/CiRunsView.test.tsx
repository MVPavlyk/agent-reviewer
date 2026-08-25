import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { CiRun } from "@devdigest/shared";
import ciMessages from "../../../../../messages/en/ci.json";

// client/INSIGHTS.md 2026-08-11: mock `@/lib/hooks/ci` directly (not the
// `@/lib/hooks` barrel) so each test can vary `data`/`isLoading` per-call.
const { useCiRunsMock } = vi.hoisted(() => ({ useCiRunsMock: vi.fn() }));
vi.mock("@/lib/hooks/ci", () => ({ useCiRuns: useCiRunsMock }));

// AppShell pulls in ShellContext (theme, command palette, "shell" i18n
// namespace) this test has no interest in wiring up — render its children
// directly, same as every other _components test in this codebase.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { CiRunsView } from "./CiRunsView";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ ci: ciMessages }}>{ui}</NextIntlClientProvider>);
}

function run(overrides: Partial<CiRun> = {}): CiRun {
  return {
    id: "run1",
    ci_installation_id: "inst1",
    repo: null,
    pr_number: 9,
    ran_at: "2026-08-20T00:00:00Z",
    status: "succeeded",
    findings_count: 3,
    cost_usd: 0.012,
    github_url: "https://github.com/acme/repo-a/actions/runs/123",
    source: "ci",
    agent: "Security Reviewer",
    agent_id: "ag1",
    verdict: "comment",
    duration_ms: 8200,
    ...overrides,
  };
}

describe("CiRunsView (SPEC-06 Pass 9, ADDENDUM v2 Chunk E)", () => {
  it("renders every column, a repo derived from the job link, and an active job link", () => {
    useCiRunsMock.mockReturnValue({ data: [run()], isLoading: false, isError: false, refetch: vi.fn() });
    renderWithIntl(<CiRunsView />);

    expect(screen.getByText("acme/repo-a")).toBeInTheDocument();
    expect(screen.getByText("#9")).toBeInTheDocument();
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("Comment")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("$0.012")).toBeInTheDocument();
    expect(screen.getByText("8.2s")).toBeInTheDocument();

    const link = screen.getByRole("link", { name: /view run/i });
    expect(link).toHaveAttribute("href", "https://github.com/acme/repo-a/actions/runs/123");
  });

  it("prefers run.repo over the job-link-derived repo when both are present", () => {
    useCiRunsMock.mockReturnValue({
      data: [run({ repo: "acme/payments-api", github_url: "https://github.com/acme/repo-a/actions/runs/123" })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderWithIntl(<CiRunsView />);

    expect(screen.getByText("acme/payments-api")).toBeInTheDocument();
    expect(screen.queryByText("acme/repo-a")).not.toBeInTheDocument();
  });

  it("renders an empty state, not a spinner or error, when there are no runs", () => {
    useCiRunsMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    renderWithIntl(<CiRunsView />);

    expect(screen.getByText(ciMessages.runs.emptyTitle)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("tolerates a null installation and an inactive (not dead) job link when github_url is null", () => {
    useCiRunsMock.mockReturnValue({
      data: [run({ ci_installation_id: null, github_url: null, pr_number: null })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderWithIntl(<CiRunsView />);

    // No repo derivable without a job link, and no PR number — both render
    // the neutral placeholder rather than crashing or omitting the row.
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: /view run/i })).not.toBeInTheDocument();
    const inactive = screen.getByText(ciMessages.runs.noLink);
    expect(inactive).toHaveAttribute("aria-disabled", "true");
    expect(inactive.tagName).not.toBe("A");
  });
});

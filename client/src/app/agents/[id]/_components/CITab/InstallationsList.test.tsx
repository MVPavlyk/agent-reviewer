import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ciMessages from "../../../../../../messages/en/ci.json";
import type { CiInstallationStatus } from "@/lib/hooks/ci";
import { InstallationsList } from "./InstallationsList";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ ci: ciMessages }}>{ui}</NextIntlClientProvider>);
}

const ROWS: CiInstallationStatus[] = [
  {
    installation: {
      id: "inst1",
      agent_id: "ag1",
      repo: "acme/repo-a",
      target_type: "gha",
      installed_at: "2026-08-20T00:00:00Z",
      workflow_version: "2",
      pr_url: null,
    },
    last_run: {
      id: "run1",
      ci_installation_id: "inst1",
      repo: "acme/repo-a",
      pr_number: 12,
      ran_at: "2026-08-23T00:00:00Z",
      status: "failed",
      findings_count: 3,
      cost_usd: 0.02,
      github_url: "https://github.com/acme/repo-a/actions/runs/1",
      source: "ci",
      agent: "Security Reviewer",
      agent_id: "ag1",
      verdict: "request_changes",
      duration_ms: 5000,
    },
    runs: [
      {
        id: "run1",
        ci_installation_id: "inst1",
        repo: "acme/repo-a",
        pr_number: 12,
        ran_at: "2026-08-23T00:00:00Z",
        status: "failed",
        findings_count: 3,
        cost_usd: 0.02,
        github_url: "https://github.com/acme/repo-a/actions/runs/1",
        source: "ci",
        agent: "Security Reviewer",
        agent_id: "ag1",
        verdict: "request_changes",
        duration_ms: 5000,
      },
    ],
  },
];

describe("InstallationsList (AC-7, ADDENDUM v2 item 4 — run history)", () => {
  it("renders repo, GitHub Actions badge, status pill (text), workflow version, and run history; '+ Add repository' fires the callback", () => {
    const onAdd = vi.fn();
    renderWithIntl(<InstallationsList installations={ROWS} onAddRepository={onAdd} />);

    expect(screen.getByText("acme/repo-a")).toBeInTheDocument();
    expect(screen.getByText("GitHub Actions")).toBeInTheDocument();
    // "Failed" appears twice: the installation's status pill AND its run
    // history row (same run, shown in both places by design).
    expect(screen.getAllByText("Failed")).toHaveLength(2);
    expect(screen.getByText("workflow v2")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /view pr/i })).not.toBeInTheDocument();
    expect(screen.getByText("PR #12")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /add repository/i }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});

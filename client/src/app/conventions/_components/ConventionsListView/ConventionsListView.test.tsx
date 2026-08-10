import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate, ConventionScanSummary } from "@devdigest/shared";
import messages from "../../../../../messages/en/conventions.json";

const CONVENTIONS: ConventionCandidate[] = [
  {
    id: "c1",
    scan_id: "s1",
    title: "Errors wrapped in Result<T>",
    rule: "r",
    evidence_path: "src/api/users.ts",
    start_line: 23,
    end_line: 31,
    evidence_snippet: "x",
    confidence: 0.91,
    status: "accepted",
    created_at: "2026-08-01T00:00:00Z",
    decided_at: "2026-08-02T00:00:00Z",
  },
  {
    id: "c2",
    scan_id: "s1",
    title: "Redis via singleton",
    rule: "r",
    evidence_path: "src/lib/redis.ts",
    start_line: 1,
    end_line: 1,
    evidence_snippet: "y",
    confidence: 0.7,
    status: "pending",
    created_at: "2026-08-01T00:00:00Z",
    decided_at: null,
  },
];

const LATEST_SCAN: ConventionScanSummary = {
  id: "s1",
  status: "done",
  sample_file_count: 42,
  candidate_count: 2,
  started_at: "2026-08-04T00:00:00Z",
  finished_at: "2026-08-04T00:01:00Z",
  error: null,
};

let activeRepo: { repoId: string | null; reposLoaded: boolean } = { repoId: "r1", reposLoaded: true };
const rescanMutate = vi.fn();
const resetAcceptedMutate = vi.fn();

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    repoId: activeRepo.repoId,
    activeRepo: activeRepo.repoId ? { id: "r1", full_name: "acme/payments-api" } : null,
    repos: [],
    reposLoaded: activeRepo.reposLoaded,
  }),
  useRepoNotFound: () => false,
}));

vi.mock("@/lib/hooks/conventions", () => ({
  useConventions: () => ({
    data: { conventions: CONVENTIONS, latest_scan: LATEST_SCAN },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useRescanConventions: () => ({ mutate: rescanMutate, isPending: false }),
  useResetAcceptedConventions: () => ({ mutate: resetAcceptedMutate, isPending: false }),
  useUpdateConvention: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
}));

vi.mock("@/lib/hooks/repo-intel", () => ({
  useRepoIntelStatus: () => ({ data: { lastIndexedSha: "deadbeef" } }),
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/repo-not-found", () => ({
  RepoNotFound: () => <div>no repo selected</div>,
}));

vi.mock("../CreateSkillFromConventionsModal", () => ({
  CreateSkillFromConventionsModal: ({ conventionIds }: { conventionIds: string[] }) => (
    <div>modal open with {conventionIds.length} conventions</div>
  ),
}));

import { ConventionsListView } from "./ConventionsListView";

afterEach(() => {
  cleanup();
  rescanMutate.mockClear();
  resetAcceptedMutate.mockClear();
  activeRepo = { repoId: "r1", reposLoaded: true };
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("ConventionsListView (smoke)", () => {
  it("renders the heading with the active repo name and the scan subtitle", () => {
    renderWithIntl(<ConventionsListView />);
    expect(screen.getByText("Conventions in acme/payments-api")).toBeInTheDocument();
    expect(screen.getByText(/Detected from 42 sample files/)).toBeInTheDocument();
  });

  it("renders every convention as a card", () => {
    renderWithIntl(<ConventionsListView />);
    expect(screen.getByText("Errors wrapped in Result<T>")).toBeInTheDocument();
    expect(screen.getByText("Redis via singleton")).toBeInTheDocument();
  });

  it("Re-scan calls the rescan mutation with the active repo id", () => {
    renderWithIntl(<ConventionsListView />);
    fireEvent.click(screen.getByText("Re-scan"));
    expect(rescanMutate).toHaveBeenCalledWith("r1");
  });

  it("shows '1 of 2 accepted' — derived from the conventions array, not duplicated state", () => {
    renderWithIntl(<ConventionsListView />);
    expect(screen.getByText("1 of 2 accepted")).toBeInTheDocument();
  });

  it("Create skill is enabled while at least one convention is accepted", () => {
    renderWithIntl(<ConventionsListView />);
    expect(screen.getByText("Create skill")).not.toBeDisabled();
  });

  it("Deselect all calls the bulk reset-accepted mutation with the active repo id", () => {
    renderWithIntl(<ConventionsListView />);
    fireEvent.click(screen.getByText("Deselect all"));
    expect(resetAcceptedMutate).toHaveBeenCalledWith("r1");
  });

  it("Create skill opens the merge modal with every currently-accepted convention", () => {
    renderWithIntl(<ConventionsListView />);
    fireEvent.click(screen.getByText("Create skill"));
    expect(screen.getByText("modal open with 1 conventions")).toBeInTheDocument();
  });

  it("shows the RepoNotFound empty state when no repo is connected", () => {
    activeRepo = { repoId: null, reposLoaded: true };
    renderWithIntl(<ConventionsListView />);
    expect(screen.getByText("no repo selected")).toBeInTheDocument();
  });
});

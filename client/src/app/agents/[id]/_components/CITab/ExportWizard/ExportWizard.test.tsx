import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { CiExport } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/ci.json";

// client/INSIGHTS.md 2026-08-11 / SPEC-06 NFR-5: mock `@/lib/hooks/ci`
// directly (not the `@/lib/hooks` barrel) so each test can vary the
// mutation's behavior per-call.
const { useExportCiMock } = vi.hoisted(() => ({ useExportCiMock: vi.fn() }));
vi.mock("@/lib/hooks/ci", () => ({ useExportCi: useExportCiMock }));

const { ciFilesToZipBlobMock } = vi.hoisted(() => ({
  ciFilesToZipBlobMock: vi.fn(() => new Blob(["zip"], { type: "application/zip" })),
}));
vi.mock("@/lib/ci-bundle-zip", () => ({ ciFilesToZipBlob: ciFilesToZipBlobMock }));

// TargetStep (step 1) lists integrated repos via useRepos — mock it so the
// wizard mounts without a QueryClient.
vi.mock("@/lib/hooks/core", () => ({
  useRepos: () => ({ data: [{ id: "1", full_name: "acme/repo" }], isLoading: false }),
}));

import { ExportWizard } from "./ExportWizard";

// jsdom doesn't implement the Blob-URL APIs the download flow uses.
(URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = vi.fn(() => "blob:mock");
(URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = vi.fn();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ ci: messages }}>{ui}</NextIntlClientProvider>);
}

const EXPORT_RESULT: CiExport = {
  installation: {
    id: "inst1",
    agent_id: "a1",
    repo: "acme/repo",
    target_type: "gha",
    installed_at: "2026-08-24T00:00:00Z",
    workflow_version: "1",
    pr_url: null,
  },
  files: [
    { path: ".devdigest/agents/security-reviewer.yaml", contents: "name: security-reviewer\n", editable: true },
    { path: ".github/workflows/devdigest-review.yml", contents: "name: DevDigest Review\n", editable: true },
    { path: ".devdigest/memory.jsonl", contents: "", editable: false },
  ],
  pr_url: null,
  ingest_token: "tok_abc123",
};

const OPEN_PR_RESULT: CiExport = {
  ...EXPORT_RESULT,
  pr_url: "https://github.com/acme/repo/pull/1",
};

describe("ExportWizard (SPEC-06 AC-2/19/24/25/27, EC-8; ADDENDUM v2 decisions 1/3)", () => {
  it("walks Target → Preview (server bundle incl. memory.jsonl, debounced re-fetch on trigger change, action:'preview') → Configure → Install, then downloads a zip and surfaces the ingest token (AC-2/19/24/27)", () => {
    vi.useFakeTimers();
    const mutate = vi.fn((vars, opts) => opts?.onSuccess?.(EXPORT_RESULT));
    useExportCiMock.mockReturnValue({ mutate, isPending: false, isError: false });
    const onClose = vi.fn();

    renderWithIntl(<ExportWizard agentId="a1" agentName="Security Reviewer" onClose={onClose} />);

    // Step 1: Target — GHA is default, enter a repo, continue.
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "acme/repo" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    // Step 2: Preview — entering the step fires a debounced server preview
    // request using the side-effect-free `action:'preview'` (Pass 5/7) —
    // never `open_pr`, which now opens a real PR. The bundle includes
    // memory.jsonl (ADDENDUM v2 decision 3).
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ repo: "acme/repo", target: "gha", action: "preview", triggers: ["opened", "synchronize"] }),
      expect.anything(),
    );
    const list = screen.getByRole("list", { name: /files to create/i });
    expect(within(list).getAllByRole("button")).toHaveLength(3);
    expect(screen.getByText(".devdigest/memory.jsonl")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    // Step 3: Configure — toggling a trigger re-requests the server preview
    // (debounced, AC-19) with the updated trigger set, still action:'preview'.
    fireEvent.click(screen.getByRole("button", { name: /pull_request:reopened/i }));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ triggers: ["opened", "synchronize", "reopened"], action: "preview" }),
      expect.anything(),
    );
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    // Step 4: Install — "Copy files as a zip" is the default; Install
    // triggers the export with action:'files', zips the returned files, and
    // shows the once-only ingest token instead of auto-closing.
    fireEvent.click(screen.getByRole("button", { name: /^install$/i }));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ repo: "acme/repo", target: "gha", action: "files" }),
      expect.anything(),
    );
    expect(ciFilesToZipBlobMock).toHaveBeenCalledWith(EXPORT_RESULT.files);
    expect(screen.getByText("tok_abc123")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /done/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("'Open a PR' is now functional: Install calls the mutation with action:'open_pr' and success shows the returned PR link (ADDENDUM v2 decision 1)", () => {
    vi.useFakeTimers();
    const mutate = vi.fn((vars, opts) => opts?.onSuccess?.(vars.action === "open_pr" ? OPEN_PR_RESULT : EXPORT_RESULT));
    useExportCiMock.mockReturnValue({ mutate, isPending: false, isError: false });
    const onClose = vi.fn();

    renderWithIntl(<ExportWizard agentId="a1" agentName="Security Reviewer" onClose={onClose} />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "acme/repo" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    fireEvent.click(screen.getByRole("button", { name: /open a pr with these files/i }));
    fireEvent.click(screen.getByRole("button", { name: /^install$/i }));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ repo: "acme/repo", target: "gha", action: "open_pr" }),
      expect.anything(),
    );

    expect(screen.getByRole("link", { name: /view pull request/i })).toHaveAttribute(
      "href",
      "https://github.com/acme/repo/pull/1",
    );
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /done/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("an export that fails on Install shows an error and does NOT close the wizard (AC-26/EC-8); retry re-invokes the mutation", () => {
    vi.useFakeTimers();
    const mutate = vi.fn((vars, opts) => {
      if (vars.action === "preview") opts?.onSuccess?.(EXPORT_RESULT);
      // action:'files' deliberately calls neither callback here — isError
      // below simulates the resulting rejected-mutation UI state.
    });
    useExportCiMock.mockReturnValue({ mutate, isPending: false, isError: true });
    const onClose = vi.fn();

    renderWithIntl(<ExportWizard agentId="a1" agentName="Security Reviewer" onClose={onClose} />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "acme/repo" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/export failed/i);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "files" }), expect.anything());
    expect(onClose).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});

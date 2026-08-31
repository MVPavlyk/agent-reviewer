import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { CiFile } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/ci.json";

import { PreviewStep } from "./PreviewStep";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ ci: messages }}>{ui}</NextIntlClientProvider>);
}

const MANIFEST_FILE: CiFile = {
  path: ".devdigest/agents/security-reviewer.yaml",
  contents: "name: security-reviewer\n",
  editable: true,
};
const WORKFLOW_FILE: CiFile = {
  path: ".github/workflows/devdigest-review.yml",
  contents: "name: DevDigest Review\non:\n  pull_request:\n    types: [opened]\n<script>alert(1)</script>",
  editable: true,
};
const MEMORY_FILE: CiFile = {
  path: ".devdigest/memory.jsonl",
  contents: "",
  editable: false,
};
// ADDENDUM v2 decision 3 reverses v1's exclusion — the server bundle now
// includes memory.jsonl, and Preview just renders whatever the server sends
// (no client-side filtering, N-3).
const FILES: CiFile[] = [MANIFEST_FILE, WORKFLOW_FILE, MEMORY_FILE];

describe("PreviewStep (SPEC-06 AC-15/16/17, NFR-2, EC-6/7; ADDENDUM v2 decision 3)", () => {
  it("renders exactly the server's file list, switches contents on click as plain text, and handles loading/error", () => {
    const onRetry = vi.fn();
    const onBack = vi.fn();
    const onContinue = vi.fn();
    const { rerender } = renderWithIntl(
      <PreviewStep files={null} isLoading isError={false} onRetry={onRetry} onBack={onBack} onContinue={onContinue} />,
    );
    // Loading → skeleton, no file list yet, Continue disabled.
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();

    // Loaded: list renders exactly the server's files (a single-skill/no-skill
    // bundle here — EC-6 — is still just manifest + workflow, nothing breaks).
    rerender(
      <NextIntlClientProvider locale="en" messages={{ ci: messages }}>
        <PreviewStep files={FILES} isLoading={false} isError={false} onRetry={onRetry} onBack={onBack} onContinue={onContinue} />
      </NextIntlClientProvider>,
    );
    const list = screen.getByRole("list", { name: /files to create/i });
    const items = within(list).getAllByRole("button");
    expect(items.map((el) => el.textContent)).toEqual([MANIFEST_FILE.path, WORKFLOW_FILE.path, MEMORY_FILE.path]);

    // Defaults to previewing the first file.
    expect(screen.getByRole("heading", { name: MANIFEST_FILE.path })).toBeInTheDocument();
    expect(screen.getByText(/name: security-reviewer/)).toBeInTheDocument();

    // Clicking the second file swaps the right-pane contents, and a raw
    // `<script>` in `contents` renders as inert text, never executes/parses (NFR-2):
    // the literal markup is a text node inside <pre>, not a real <script> element.
    fireEvent.click(within(list).getByText(WORKFLOW_FILE.path));
    expect(screen.getByRole("heading", { name: WORKFLOW_FILE.path })).toBeInTheDocument();
    const scriptText = screen.getByText(/<script>alert\(1\)<\/script>/);
    expect(scriptText.tagName.toLowerCase()).toBe("pre");
    expect(document.querySelectorAll("script").length).toBe(0);

    expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onContinue).toHaveBeenCalledTimes(1);

    // Error → retry.
    rerender(
      <NextIntlClientProvider locale="en" messages={{ ci: messages }}>
        <PreviewStep files={null} isLoading={false} isError onRetry={onRetry} onBack={onBack} onContinue={onContinue} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("a long system_prompt-style file stays inside a scrolling pane (EC-7)", () => {
    const longFile: CiFile = { path: ".devdigest/agents/x.yaml", contents: "line\n".repeat(500), editable: true };
    const { container } = renderWithIntl(
      <PreviewStep files={[longFile]} isLoading={false} isError={false} onRetry={vi.fn()} onBack={vi.fn()} onContinue={vi.fn()} />,
    );
    const pre = container.querySelector("pre");
    expect(pre).toBeTruthy();
    expect(pre).toHaveStyle({ overflow: "auto" });
  });
});

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ContextDoc, ContextDocLink, Repo } from "@/lib/types";
import contextMessages from "../../../messages/en/context.json";

const DOCS: ContextDoc[] = [
  { path: "specs/a.md", dir_type: "specs", size_bytes: 400, tokens: 100, content_hash: "h1", used_by_agents: 1, excluded_reason: null },
  { path: "docs/b.md", dir_type: "docs", size_bytes: 200, tokens: 50, content_hash: "h2", used_by_agents: 1, excluded_reason: null },
  { path: "specs/huge.md", dir_type: "specs", size_bytes: 999999, tokens: 0, content_hash: "h3", used_by_agents: 0, excluded_reason: "too_large" },
  { path: "docs/attachable.md", dir_type: "docs", size_bytes: 40, tokens: 5, content_hash: "h4", used_by_agents: 0, excluded_reason: null },
];

// inherited (docs/b.md, via a skill) before the two own rows (specs/a.md, then
// the missing specs/removed.md) — mirrors the server's skills-then-own order.
const LINKS: ContextDocLink[] = [
  { path: "docs/b.md", order: 0, source: "skill", skill_id: "sk1", skill_name: "Security Skill", skill_enabled: true },
  { path: "specs/a.md", order: 0, source: "agent" },
  { path: "specs/removed.md", order: 1, source: "agent" },
];

const REPO_1: Repo = {
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
const REPO_2: Repo = { ...REPO_1, id: "repo2", name: "other", full_name: "acme/other" };

const { useReposMock, useContextDocContentMock } = vi.hoisted(() => ({
  useReposMock: vi.fn(),
  useContextDocContentMock: vi.fn(),
}));
vi.mock("@/lib/hooks", () => ({
  useRepos: useReposMock,
  useContextDocContent: useContextDocContentMock,
}));

import { ContextDocPicker } from "./ContextDocPicker";

afterEach(() => {
  cleanup();
  useReposMock.mockReset();
  useContextDocContentMock.mockReset();
  useReposMock.mockReturnValue({ data: [REPO_1] });
  useContextDocContentMock.mockReturnValue({ data: undefined, isLoading: false });
});
useReposMock.mockReturnValue({ data: [REPO_1] });
useContextDocContentMock.mockReturnValue({ data: undefined, isLoading: false });

function renderPicker(props: Partial<React.ComponentProps<typeof ContextDocPicker>> = {}) {
  const onChange = props.onChange ?? vi.fn();
  return {
    onChange,
    ...render(
      <NextIntlClientProvider locale="en" messages={{ context: contextMessages }}>
        <ContextDocPicker
          repoId="repo1"
          links={LINKS}
          docs={DOCS}
          onChange={onChange}
          isPending={false}
          variant="agent"
          {...props}
        />
      </NextIntlClientProvider>,
    ),
  };
}

describe("ContextDocPicker (SPEC-02 AC-16..AC-48)", () => {
  it("shows the attached count, an inherited row's source badge with no detach control, and a missing row's badge", () => {
    renderPicker();
    expect(screen.getByText("3 of 4 attached")).toBeInTheDocument();
    expect(screen.getByText("via Security Skill")).toBeInTheDocument();
    // The inherited row has no attach/detach Toggle.
    expect(screen.queryByRole("switch", { name: "docs/b.md attached" })).not.toBeInTheDocument();
    expect(screen.getByText("missing")).toBeInTheDocument();
    // Basename shown, full path reserved for the title attribute (EC-4).
    expect(screen.getByTitle("specs/removed.md")).toBeInTheDocument();
    expect(screen.queryByText("specs/removed.md")).not.toBeInTheDocument();
  });

  it("reorders the OWN attachments with ArrowUp/ArrowDown, disabling the boundary buttons (AC-16, EC-13), and is keyboard-reachable", () => {
    const { onChange } = renderPicker();
    const moveUp = screen.getAllByRole("button", { name: "Move up" });
    const moveDown = screen.getAllByRole("button", { name: "Move down" });
    // Own rows: [specs/a.md, specs/removed.md] — first can't move up, last can't move down.
    expect(moveUp[0]).toBeDisabled();
    expect(moveDown[1]).toBeDisabled();
    expect(moveDown[0]).not.toBeDisabled();

    // NFR-4: a native <button> is tab-reachable and activates on Enter/Space
    // by the browser's own semantics — assert the enabled control can take
    // focus (no positive tabIndex override, no keyboard-only affordance lost).
    moveDown[0]!.focus();
    expect(moveDown[0]).toHaveFocus();

    fireEvent.click(moveDown[0]!);
    expect(onChange).toHaveBeenCalledWith(["specs/removed.md", "specs/a.md"]);
  });

  it("filters the attachable list and shows a filter-specific empty state, distinct from the full-empty state (AC-18/19/EC-3)", () => {
    renderPicker();
    expect(screen.getByText("attachable.md")).toBeInTheDocument();
    expect(screen.getByText("huge.md")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Filter documents…"), { target: { value: "attach" } });
    expect(screen.getByText("attachable.md")).toBeInTheDocument();
    expect(screen.queryByText("huge.md")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Filter documents…"), { target: { value: "zzz-no-match" } });
    expect(screen.getByText("No documents match your filter.")).toBeInTheDocument();
    expect(screen.queryByText("No context documents found")).not.toBeInTheDocument();
  });

  it("shows the too-large badge on an excluded doc in the attach list (EC-9)", () => {
    renderPicker();
    expect(screen.getByText("too large — excluded")).toBeInTheDocument();
  });

  it("shows an approx-token footer with an untrusted-block note and no token-budget warning anywhere (AC-20/45, AC-22 negative)", () => {
    renderPicker();
    // specs/a.md(100) + docs/b.md(50, inherited+enabled) + specs/removed.md(missing, 0) = 150.
    expect(screen.getByText(/≈ 150 tokens/)).toBeInTheDocument();
    expect(screen.getByText(/untrusted block/)).toBeInTheDocument();
    expect(screen.queryByText(/budget|threshold|exceeds|limit/i)).not.toBeInTheDocument();
  });

  it("disables every attach/detach and reorder control while a mutation is pending (AC-24)", () => {
    renderPicker({ isPending: true });
    expect(screen.getAllByRole("button", { name: "Move up" })[0]).toBeDisabled();
    expect(screen.getByRole("switch", { name: "a.md attached" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "attachable.md attached" })).toBeDisabled();
  });

  it("attaching a doc appends it to the own set, and removing the missing row detaches it, both via the Toggle (AC-36, EC-5)", () => {
    const { onChange } = renderPicker();
    fireEvent.click(screen.getByRole("switch", { name: "attachable.md attached" }));
    expect(onChange).toHaveBeenCalledWith(["specs/a.md", "specs/removed.md", "docs/attachable.md"]);

    fireEvent.click(screen.getByRole("switch", { name: "removed.md attached" }));
    expect(onChange).toHaveBeenCalledWith(["specs/a.md"]);
  });

  it("shows a preview inline without navigating away, for both linked and attachable rows (AC-23)", () => {
    useContextDocContentMock.mockReturnValue({
      data: { path: "specs/a.md", content: "Hello preview body", truncated: false },
      isLoading: false,
    });
    renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "Preview specs/a.md" }));
    expect(screen.getByText("Hello preview body")).toBeInTheDocument();
  });

  it("warns about the multi-repo scope only when the workspace has more than one repo, and names the current one (AC-46/47/48, EC-15/16)", () => {
    useReposMock.mockReturnValue({ data: [REPO_1] });
    renderPicker();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    cleanup();
    useReposMock.mockReturnValue({ data: [REPO_1, REPO_2] });
    renderPicker();
    expect(screen.getByRole("alert")).toHaveTextContent("acme/widgets");
    expect(screen.getByText(/estimate for acme\/widgets's clone only/)).toBeInTheDocument();
  });
});

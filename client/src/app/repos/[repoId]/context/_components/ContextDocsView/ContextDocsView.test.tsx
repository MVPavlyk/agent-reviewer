import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ContextDoc, ContextDocContent, ContextDocsResponse } from "@/lib/types";
import { ApiError } from "@/lib/api";
import messages from "../../../../../../../messages/en/context.json";

const DOCS: ContextDoc[] = [
  {
    path: "docs/a.md",
    dir_type: "docs",
    size_bytes: 120,
    tokens: 42,
    content_hash: "h1",
    used_by_agents: 2,
    excluded_reason: null,
  },
  {
    path: "specs/b.md",
    dir_type: "specs",
    size_bytes: 80,
    tokens: 10,
    content_hash: "h2",
    used_by_agents: 0,
    excluded_reason: null,
  },
];

const RESPONSE: ContextDocsResponse = {
  docs: DOCS,
  roots: ["specs", "docs", "insights"],
  scanned_at: "2026-08-20T10:00:00.000Z",
};

let searchParam = "";
const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r1" }),
  useRouter: () => ({ push: vi.fn(), replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(searchParam),
}));

// AppShell requires ShellContext (theme, command palette) this test has no
// interest in — render its children directly, same as every other
// _components test in this codebase (client/INSIGHTS.md 2026-08-03).
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    repoId: "r1",
    activeRepo: { id: "r1", full_name: "acme/widgets" },
    repos: [],
    reposLoaded: true,
  }),
}));

let docsState: {
  data: ContextDocsResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
};
let contentState: { data: ContextDocContent | undefined } = { data: undefined };
const refreshMutate = vi.fn();
const refreshRepoMutate = vi.fn();
const refetchMock = vi.fn();

vi.mock("@/lib/hooks", () => ({
  useContextDocs: () => docsState,
  useContextDocContent: () => contentState,
  useRefreshContextDocs: () => ({ mutate: refreshMutate, isPending: false }),
  useRefreshRepo: () => ({ mutate: refreshRepoMutate, isPending: false }),
}));

import { ContextDocsView } from "./ContextDocsView";

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ContextDocsView />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  searchParam = "";
  replaceMock.mockClear();
  refreshMutate.mockClear();
  refreshRepoMutate.mockClear();
  refetchMock.mockClear();
  contentState = { data: undefined };
});

describe("ContextDocsView", () => {
  it("shows loading skeletons, not the empty or error state", () => {
    docsState = { data: undefined, isLoading: true, isError: false, error: null, refetch: refetchMock };
    renderView();
    expect(screen.queryByText("No context documents found")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a repo-not-cloned state with a sync action for a 409 clone_missing error", () => {
    docsState = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError("clone missing", 409, "clone_missing"),
      refetch: refetchMock,
    };
    renderView();
    expect(screen.getByText("Repository not cloned yet")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Sync repository"));
    expect(refreshRepoMutate).toHaveBeenCalledWith("r1");
  });

  it("shows a generic error state with retry for any other error", () => {
    docsState = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError("boom", 500),
      refetch: refetchMock,
    };
    renderView();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Retry"));
    expect(refetchMock).toHaveBeenCalled();
  });

  it("shows an empty state listing the configured roots when there are no docs", () => {
    docsState = {
      data: { docs: [], roots: ["specs", "docs"], scanned_at: RESPONSE.scanned_at },
      isLoading: false,
      isError: false,
      error: null,
      refetch: refetchMock,
    };
    renderView();
    expect(screen.getByText("No context documents found")).toBeInTheDocument();
    expect(screen.getByText(/specs, docs/)).toBeInTheDocument();
  });

  it("renders the doc list with dir_type badges, used_by_agents, a footer, and no create/upload/rename/delete/Edit controls", () => {
    docsState = { data: RESPONSE, isLoading: false, isError: false, error: null, refetch: refetchMock };
    renderView();

    expect(screen.getByText("docs/a.md")).toBeInTheDocument();
    expect(screen.getByText("specs/b.md")).toBeInTheDocument();
    expect(screen.getByText("docs")).toBeInTheDocument();
    expect(screen.getByText("specs")).toBeInTheDocument();
    expect(screen.getByText("2 agents")).toBeInTheDocument();

    // AC-12: footer is document count + scanned_at, never "chunks"/coverage.
    expect(screen.getByText(/2 documents/)).toBeInTheDocument();
    expect(screen.queryByText(/chunks/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/coverage/i)).not.toBeInTheDocument();

    // AC-9: read-only screen — no create/upload/rename/delete/Edit controls.
    for (const name of [/create/i, /upload/i, /rename/i, /delete/i, /^edit$/i]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
  });

  it("selecting a doc writes ?doc= via router.replace", () => {
    docsState = { data: RESPONSE, isLoading: false, isError: false, error: null, refetch: refetchMock };
    renderView();

    fireEvent.click(screen.getByText("docs/a.md"));
    expect(replaceMock).toHaveBeenCalledTimes(1);
    const url = replaceMock.mock.calls[0]![0] as string;
    const sp = new URLSearchParams(url.split("?")[1]);
    expect(sp.get("doc")).toBe("docs/a.md");
  });

  it("renders the markdown preview and a truncated note for the doc named by ?doc=", () => {
    searchParam = "doc=docs/a.md";
    docsState = { data: RESPONSE, isLoading: false, isError: false, error: null, refetch: refetchMock };
    contentState = { data: { path: "docs/a.md", content: "# Hello\n\nWorld", truncated: true } };
    renderView();

    expect(screen.getByRole("heading", { name: "Hello" })).toBeInTheDocument();
    expect(screen.getByText("World")).toBeInTheDocument();
    expect(screen.getByText(/truncated/i)).toBeInTheDocument();
  });

  it("clicking refresh triggers the refresh mutation for the current repo", () => {
    docsState = { data: RESPONSE, isLoading: false, isError: false, error: null, refetch: refetchMock };
    renderView();

    fireEvent.click(screen.getByText("Refresh"));
    expect(refreshMutate).toHaveBeenCalledWith("r1");
  });

  it("NFR-2: never renders raw <script>, javascript: links, or event-handler attributes from doc content", () => {
    searchParam = "doc=docs/a.md";
    docsState = { data: RESPONSE, isLoading: false, isError: false, error: null, refetch: refetchMock };
    contentState = {
      data: {
        path: "docs/a.md",
        content:
          '<script>alert(1)</script>\n\n[click me](javascript:alert(1))\n\n<img src="x" onerror="alert(1)">',
        truncated: false,
      },
    };
    const { container } = renderView();

    // Raw HTML in the source (no rehype-raw plugin) is escaped to visible
    // text, never parsed into real elements/attributes — that's the whole
    // NFR-2 answer (30-plan.md §2/§7 п.8).
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
    const link = screen.queryByRole("link", { name: "click me" });
    if (link) expect(link.getAttribute("href")).not.toMatch(/^javascript:/i);
  });
});

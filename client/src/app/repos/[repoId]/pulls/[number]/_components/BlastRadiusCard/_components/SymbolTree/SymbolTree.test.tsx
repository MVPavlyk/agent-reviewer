import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastRadius } from "@/vendor/shared";
import blast from "../../../../../../../../../../messages/en/blast.json";
import { SymbolTree } from "./SymbolTree";

const RADIUS: BlastRadius = {
  changed_symbols: [{ name: "rateLimit", file: "src/rate-limit.ts", kind: "function" }],
  downstream: [
    {
      symbol: "rateLimit",
      callers: [{ name: "publicRouter", file: "src/routes/items.ts", line: 42, rank: 0.8 }],
      callers_total: 1,
      callers_truncated: false,
      endpoints_affected: [
        { value: "GET /api/items", file: "src/routes/items.ts", via_symbol: "rateLimit", via_file: "src/rate-limit.ts", depth: 0 },
      ],
      crons_affected: [],
    },
  ],
  summary: "1 symbol, 1 caller, 1 endpoint, 0 crons",
  status: "ok",
  reason: null,
  message: "",
  coverage: {
    changed_files: ["src/rate-limit.ts"],
    analyzed_files: ["src/rate-limit.ts"],
    unsupported_files: [],
    files_without_rank: [],
    indexer_version: 2,
    last_indexed_sha: "deadbeef",
  },
  head_sha: "deadbeef",
};

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ blast }}>{ui}</NextIntlClientProvider>);
}

afterEach(cleanup);

describe("SymbolTree", () => {
  it("renders a tree with the symbol, its caller link (basename:line + full-path title), and its endpoint chip", () => {
    renderWithIntl(<SymbolTree radius={RADIUS} repoFullName="acme/payments-api" indexedSha="deadbeef" />);

    expect(screen.getByRole("tree")).toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: "rateLimit" })).toBeInTheDocument();

    const link = screen.getByText("items.ts:42");
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("title", "src/routes/items.ts");
    expect(link).toHaveAttribute("href", expect.stringContaining("/blob/deadbeef/src/routes/items.ts#L42"));

    expect(screen.getByText("GET /api/items")).toBeInTheDocument();
  });

  it("falls back to plain (non-link) text when repoFullName is not known yet", () => {
    renderWithIntl(<SymbolTree radius={RADIUS} repoFullName={null} indexedSha="deadbeef" />);
    const label = screen.getByText("items.ts:42");
    expect(label.tagName).toBe("SPAN");
  });

  it("falls back to plain (non-link) text when the index sha isn't known", () => {
    renderWithIntl(<SymbolTree radius={RADIUS} repoFullName="acme/payments-api" indexedSha={null} />);
    const label = screen.getByText("items.ts:42");
    expect(label.tagName).toBe("SPAN");
  });
});

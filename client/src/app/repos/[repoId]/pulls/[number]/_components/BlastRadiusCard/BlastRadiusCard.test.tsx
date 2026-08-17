import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastRadius } from "@/vendor/shared";
import blast from "../../../../../../../../messages/en/blast.json";

const { usePrBlastMock } = vi.hoisted(() => ({ usePrBlastMock: vi.fn() }));
vi.mock("@/lib/hooks", () => ({
  usePrBlast: usePrBlastMock,
}));

import { BlastRadiusCard } from "./BlastRadiusCard";

const OK_RADIUS: BlastRadius = {
  changed_symbols: [
    { name: "rateLimit", file: "src/rate-limit.ts", kind: "function" },
    { name: "resetBuckets", file: "src/rate-limit.ts", kind: "function" },
  ],
  downstream: [
    {
      symbol: "rateLimit",
      callers: Array.from({ length: 14 }, (_, i) => ({
        name: `caller${i}`,
        file: `src/routes/items${i}.ts`,
        line: i + 1,
        rank: 1 - i / 20,
      })),
      callers_total: 14,
      callers_truncated: false,
      endpoints_affected: [
        { value: "GET /api/items", file: "src/routes/items.ts", via_symbol: "rateLimit", via_file: "src/rate-limit.ts", depth: 0 },
        { value: "POST /api/items", file: "src/routes/items.ts", via_symbol: "rateLimit", via_file: "src/rate-limit.ts", depth: 0 },
        { value: "GET /api/public/items", file: "src/routes/webhooks.ts", via_symbol: null, via_file: "src/rate-limit.ts", depth: 2 },
      ],
      crons_affected: [
        { value: "reset-rate-buckets (hourly)", file: "src/jobs/reset.ts", via_symbol: "resetBuckets", via_file: "src/rate-limit.ts", depth: 0 },
      ],
    },
  ],
  summary: "2 symbols, 14 callers, 3 endpoints, 1 cron",
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
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  usePrBlastMock.mockReset();
});

describe("BlastRadiusCard", () => {
  it("ok status: renders stats and a tree with both symbols and their downstream impact", () => {
    usePrBlastMock.mockReturnValue({ data: OK_RADIUS, isLoading: false, isError: false });
    renderWithIntl(<BlastRadiusCard prId="pr1" repoFullName="acme/payments-api" />);

    expect(screen.getByText("2")).toBeInTheDocument(); // symbols count
    expect(screen.getByRole("tree")).toBeInTheDocument();
    expect(screen.getByText("rateLimit")).toBeInTheDocument();
    expect(screen.getByText("GET /api/items")).toBeInTheDocument();
    expect(screen.getByText("reset-rate-buckets (hourly)")).toBeInTheDocument();

    // caller link renders basename:line, with the full path in the title tooltip
    const link = screen.getByText("items0.ts:1");
    expect(link).toHaveAttribute("title", "src/routes/items0.ts");
    expect(link).toHaveAttribute("href", expect.stringContaining("/blob/deadbeef/src/routes/items0.ts#L1"));
  });

  it("degraded status: shows the message, never renders a tree (no masking with an empty list)", () => {
    usePrBlastMock.mockReturnValue({
      data: {
        ...OK_RADIUS,
        downstream: [],
        changed_symbols: [],
        status: "degraded",
        reason: "no_index",
        message: "This repository has not been indexed yet — run a resync.",
      },
      isLoading: false,
      isError: false,
    });
    renderWithIntl(<BlastRadiusCard prId="pr1" repoFullName="acme/payments-api" />);

    expect(screen.getByText("This repository has not been indexed yet — run a resync.")).toBeInTheDocument();
    expect(screen.queryByRole("tree")).not.toBeInTheDocument();
  });

  it("partial status: shows both the warning banner and the tree", () => {
    usePrBlastMock.mockReturnValue({
      data: { ...OK_RADIUS, status: "partial", reason: "rank_missing", message: "File rank is unavailable." },
      isLoading: false,
      isError: false,
    });
    renderWithIntl(<BlastRadiusCard prId="pr1" repoFullName="acme/payments-api" />);

    expect(screen.getByText("File rank is unavailable.")).toBeInTheDocument();
    expect(screen.getByRole("tree")).toBeInTheDocument();
  });

  it("tree/graph toggle switches the rendered content", () => {
    usePrBlastMock.mockReturnValue({ data: OK_RADIUS, isLoading: false, isError: false });
    renderWithIntl(<BlastRadiusCard prId="pr1" repoFullName="acme/payments-api" />);

    expect(screen.getByRole("tree")).toBeInTheDocument();
    fireEvent.click(screen.getByText("graph"));
    expect(screen.queryByRole("tree")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Blast radius graph")).toBeInTheDocument();
  });
});

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrBriefRecord } from "@/vendor/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

// client/INSIGHTS.md 2026-08-11: don't partially mock the `@/lib/hooks`
// barrel — mock `@/lib/hooks/brief` directly, like `IntentCard.test.tsx`
// mocks `@/lib/hooks/reviews`.
const { usePrBriefMock, useGenerateBriefMock, mutate } = vi.hoisted(() => ({
  usePrBriefMock: vi.fn(),
  useGenerateBriefMock: vi.fn(),
  mutate: vi.fn(),
}));
vi.mock("@/lib/hooks/brief", () => ({
  usePrBrief: usePrBriefMock,
  useGenerateBrief: useGenerateBriefMock,
}));

import { PrBriefCard } from "./PrBriefCard";

const FULL_BRIEF: PrBriefRecord = {
  what: "Rotates the Stripe secret key used by the billing worker.",
  why: "The old key leaked in a support ticket and must be revoked.",
  risk_level: "high",
  risks: [
    {
      kind: "security",
      title: "Old key stays valid during rollout",
      explanation: "There is a short window where both keys are accepted.",
      severity: "high",
      file_refs: ["src/config.ts"],
    },
  ],
  review_focus: [{ file: "src/config.ts", line: 12, reason: "new key assignment" }],
  pr_id: "pr-1",
  provider: "openai",
  model: "gpt-4.1",
  generated_at: "2024-01-01T00:00:00.000Z",
  source_updated_at: "2024-01-01T00:00:00.000Z",
};

afterEach(() => {
  cleanup();
  mutate.mockClear();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("PrBriefCard", () => {
  it("shows a skeleton and makes zero requests when prId is null (EC-9)", () => {
    usePrBriefMock.mockReturnValue({ data: undefined, isLoading: false, notFound: false });
    useGenerateBriefMock.mockReturnValue({ mutate, isPending: false, isError: false });
    renderWithIntl(<PrBriefCard prId={null} repoFullName={null} />);

    expect(usePrBriefMock).toHaveBeenCalledWith(null);
    expect(screen.queryByText(/pr brief/i)).not.toBeInTheDocument();
  });

  it("empty state: CTA generates without force; footer regenerate is not shown yet", () => {
    usePrBriefMock.mockReturnValue({ data: undefined, isLoading: false, notFound: true });
    useGenerateBriefMock.mockReturnValue({ mutate, isPending: false, isError: false });
    renderWithIntl(<PrBriefCard prId="pr1" repoFullName="acme/repo" />);

    expect(screen.getByText(/brief not yet generated/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /regenerate/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /generate brief/i }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({});
  });

  it("isPending disables the CTA (AC-8)", () => {
    usePrBriefMock.mockReturnValue({ data: undefined, isLoading: false, notFound: true });
    useGenerateBriefMock.mockReturnValue({ mutate, isPending: true, isError: false });
    renderWithIntl(<PrBriefCard prId="pr1" repoFullName="acme/repo" />);

    expect(screen.getByRole("button", { name: /generate brief/i })).toBeDisabled();
  });

  it("a rejected mutation shows an error notice while KEEPING the previous brief visible (AC-7/EC-3)", () => {
    usePrBriefMock.mockReturnValue({ data: FULL_BRIEF, isLoading: false, notFound: false });
    useGenerateBriefMock.mockReturnValue({ mutate, isPending: false, isError: true });
    renderWithIntl(<PrBriefCard prId="pr1" repoFullName="acme/repo" />);

    expect(screen.getByText(/engine returned an error/i)).toBeInTheDocument();
    // The previously-cached brief content is still rendered, not replaced.
    expect(screen.getByText(/rotates the stripe secret key/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(mutate).toHaveBeenCalledWith({});
  });

  it("renders a full brief: what/why, risk badge with TEXT, clickable focus links, footer regenerate with force", () => {
    usePrBriefMock.mockReturnValue({ data: FULL_BRIEF, isLoading: false, notFound: false });
    useGenerateBriefMock.mockReturnValue({ mutate, isPending: false, isError: false });
    renderWithIntl(
      <PrBriefCard prId="pr1" prUpdatedAt="2024-06-01T00:00:00.000Z" repoFullName="acme/repo" headSha="deadbeef" />,
    );

    expect(screen.getByText(/rotates the stripe secret key/i)).toBeInTheDocument();
    expect(screen.getByText(/old key leaked/i)).toBeInTheDocument();
    // AC-12: risk_level badge carries a TEXT label, not color alone.
    expect(screen.getByText(/high risk/i)).toBeInTheDocument();
    expect(screen.getByText("Old key stays valid during rollout")).toBeInTheDocument();

    // AC-13: review_focus renders a github blob link containing sha/file/line.
    const link = screen.getByRole("link", { name: /config\.ts:12/i });
    expect(link).toHaveAttribute("href", expect.stringContaining("blob/deadbeef/src/config.ts#L12"));

    // AC-9: prUpdatedAt after source_updated_at → stale notice.
    expect(screen.getByText(/pr updated since this brief was generated/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /regenerate/i }));
    expect(mutate).toHaveBeenCalledWith({ force: true });
  });

  it("EC-6/AC-14: a null line omits #L, and a missing headSha renders plain text instead of a link", () => {
    const brief = { ...FULL_BRIEF, review_focus: [{ file: "src/config.ts", line: null, reason: "no line" }] };
    usePrBriefMock.mockReturnValue({ data: brief, isLoading: false, notFound: false });
    useGenerateBriefMock.mockReturnValue({ mutate, isPending: false, isError: false });
    renderWithIntl(<PrBriefCard prId="pr1" repoFullName="acme/repo" headSha={null} />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getAllByText(/config\.ts/).length).toBeGreaterThan(0);
  });

  it("AC-16/EC-5: empty risks/review_focus render explicit empty copy", () => {
    const brief = { ...FULL_BRIEF, risks: [], review_focus: [] };
    usePrBriefMock.mockReturnValue({ data: brief, isLoading: false, notFound: false });
    useGenerateBriefMock.mockReturnValue({ mutate, isPending: false, isError: false });
    renderWithIntl(<PrBriefCard prId="pr1" repoFullName="acme/repo" />);

    expect(screen.getByText(/no specific risks identified/i)).toBeInTheDocument();
    expect(screen.getByText(/no specific files flagged/i)).toBeInTheDocument();
  });

  it("AC-10: no stale notice when source_updated_at is null", () => {
    const brief = { ...FULL_BRIEF, source_updated_at: null };
    usePrBriefMock.mockReturnValue({ data: brief, isLoading: false, notFound: false });
    useGenerateBriefMock.mockReturnValue({ mutate, isPending: false, isError: false });
    renderWithIntl(<PrBriefCard prId="pr1" prUpdatedAt="2024-06-01T00:00:00.000Z" repoFullName="acme/repo" />);

    expect(screen.queryByText(/pr updated since this brief was generated/i)).not.toBeInTheDocument();
  });

  it("AC-18: a long file path shows only the basename with the full path in title", () => {
    const brief = {
      ...FULL_BRIEF,
      risks: [
        {
          kind: "security",
          title: "t",
          explanation: "e",
          severity: "low" as const,
          file_refs: ["src/very/deeply/nested/module/config.ts"],
        },
      ],
    };
    usePrBriefMock.mockReturnValue({ data: brief, isLoading: false, notFound: false });
    useGenerateBriefMock.mockReturnValue({ mutate, isPending: false, isError: false });
    renderWithIntl(<PrBriefCard prId="pr1" repoFullName="acme/repo" />);

    const badge = screen.getByTitle("src/very/deeply/nested/module/config.ts");
    expect(badge).toHaveTextContent("config.ts");
  });
});

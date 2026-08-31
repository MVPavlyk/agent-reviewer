import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../messages/en/runs.json"; // apps/web/messages/en/runs.json

// Mock the trace hooks so the drawer renders without a query client / SSE.
const TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, cost_usd: 0.06, findings: 2, grounding: "2/2 passed" },
  prompt_assembly: { system: "You are a reviewer.", skills: "### skill", memory: null, specs: null, user: "Review PR #482" },
  tool_calls: [{ tool: "review_file", args: "src/config.ts", meta: "single-pass", ms: 1200 }],
  raw_output: '{"verdict":"request_changes"}',
  memory_pulled: [{ pr: 471, text: "rate-limit public endpoints" }],
  specs_read: [],
  log: [
    { t: "00.10", kind: "info", msg: "Starting review with agent Security" },
    { t: "00.90", kind: "result", msg: "Citation grounding: 2/2 passed" },
  ],
};

const { useRunTraceMock } = vi.hoisted(() => ({ useRunTraceMock: vi.fn() }));
vi.mock("@/lib/hooks/trace", () => ({
  useRunTrace: useRunTraceMock,
}));
vi.mock("@/lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: false }),
}));

import RunTraceDrawer from "./RunTraceDrawer";

afterEach(() => {
  cleanup();
  useRunTraceMock.mockReset();
  useRunTraceMock.mockReturnValue({ data: TRACE, isLoading: false });
});
useRunTraceMock.mockReturnValue({ data: TRACE, isLoading: false });

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <div data-theme="dark">{ui}</div>
    </NextIntlClientProvider>,
  );
}

describe("A5 Run Trace drawer (smoke)", () => {
  it("renders the trace tabs and stats", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();
    expect(screen.getByText("2/2 passed")).toBeInTheDocument();
    expect(screen.getByText("$0.06")).toBeInTheDocument();
    expect(screen.getByText("Tool calls")).toBeInTheDocument();
  });

  it("switches to the live log tab", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("log"));
    // LiveLogStream renders its filter input
    expect(screen.getByPlaceholderText("Filter log…")).toBeInTheDocument();
  });

  it("shows a Skills prompt block with a ~N tokens estimate when the trace has one", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    // "Prompt assembly" section starts collapsed — open it.
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.getByText("Skills (dynamic)")).toBeInTheDocument();
    // TRACE.prompt_assembly.skills = "### skill" → ceil(9/4) = 3 tokens.
    expect(screen.getByText("~3 tokens", { exact: false })).toBeInTheDocument();
  });

  it("omits the Skills prompt block when prompt_assembly.skills is null (disabled skill)", () => {
    useRunTraceMock.mockReturnValue({
      data: { ...TRACE, prompt_assembly: { ...TRACE.prompt_assembly, skills: null } },
      isLoading: false,
    });
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.queryByText("Skills (dynamic)")).not.toBeInTheDocument();
  });

  it("shows a Project context prompt block with the untrusted wrapper and Specs read paths when the trace has specs", () => {
    const SPECS_TEXT = '<untrusted source="spec-0">\n# docs/a.md\n\nSome doc body\n</untrusted>';
    useRunTraceMock.mockReturnValue({
      data: {
        ...TRACE,
        prompt_assembly: { ...TRACE.prompt_assembly, specs: SPECS_TEXT },
        specs_read: ["docs/a.md"],
      },
      isLoading: false,
    });
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);

    // "Specs read" (Configuration section) lists the path.
    expect(screen.getByText("docs/a.md")).toBeInTheDocument();

    // Prompt assembly section: new label, expands to show the untrusted wrapper + path.
    fireEvent.click(screen.getByText("Prompt assembly"));
    // Scope to `span` so this doesn't also match the ancestor row/head divs
    // that contain the same text as part of a longer concatenation.
    const specsLabel = screen.getByText(
      (content, el) => el?.tagName.toLowerCase() === "span" && content.startsWith("Project context — attached specs"),
      { selector: "span" },
    );
    expect(specsLabel).toBeInTheDocument();
    fireEvent.click(specsLabel);
    const promptPre = screen.getByText(
      (content, el) => el?.tagName.toLowerCase() === "pre" && content.includes('<untrusted source="spec-0">'),
      { selector: "pre" },
    );
    expect(promptPre).toBeInTheDocument();
    expect(promptPre.textContent).toContain("docs/a.md");
  });

  it("shows no Project context block and 'none' for Specs read when the trace has no specs (old trace / no docs attached)", () => {
    useRunTraceMock.mockReturnValue({
      data: { ...TRACE, prompt_assembly: { ...TRACE.prompt_assembly, specs: null }, specs_read: [] },
      isLoading: false,
    });
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);

    expect(screen.getByText("none")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.queryByText("Project context — attached specs (untrusted)", { exact: false })).not.toBeInTheDocument();
  });
});

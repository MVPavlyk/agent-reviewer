import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../messages/en/multiAgent.json";
import type { AgentColumn } from "@devdigest/shared";
import { ColumnsView } from "./ColumnsView";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ multiAgent: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const DONE: AgentColumn = {
  run_id: "run1",
  agent_id: "a1",
  agent_name: "Security",
  provider: "openai",
  model: "gpt-4.1",
  status: "done",
  verdict: "request_changes",
  score: 62,
  summary: "2 findings",
  duration_ms: 8000,
  cost_usd: 0.03,
  findings: [
    { id: "f1", severity: "CRITICAL", category: "security", title: "Hardcoded secret", file: "src/config.ts", start_line: 11, kind: "finding" },
  ],
};

const FAILED: AgentColumn = {
  run_id: "run2",
  agent_id: "a2",
  agent_name: "Performance",
  provider: "openai",
  model: "gpt-4.1",
  status: "failed",
  verdict: null,
  score: null,
  summary: null,
  duration_ms: null,
  cost_usd: null,
  findings: [],
};

describe("ColumnsView", () => {
  it("renders one column per agent with compact rows and findings count (AC-17/18)", () => {
    const onViewTrace = vi.fn();
    renderWithIntl(<ColumnsView columns={[DONE]} onViewTrace={onViewTrace} />);

    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("1 findings")).toBeInTheDocument();

    fireEvent.click(screen.getByText("View trace"));
    expect(onViewTrace).toHaveBeenCalledWith("run1");
  });

  it("shows a failure state (not '0 findings') for a failed agent (AC-19/EC-5)", () => {
    renderWithIntl(<ColumnsView columns={[FAILED]} onViewTrace={vi.fn()} />);
    expect(screen.getByText("This agent failed")).toBeInTheDocument();
    expect(screen.queryByText("0 findings")).not.toBeInTheDocument();
  });
});

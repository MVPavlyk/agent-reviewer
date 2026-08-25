import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import ciMessages from "../../../../../../messages/en/ci.json";

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("@/lib/hooks/agents", () => ({ useUpdateAgent: () => ({ mutate, isPending: false }) }));

import { FailCiOnControl } from "./FailCiOnControl";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "s",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "warning",
  repo_intel: true,
  enabled: true,
  version: 1,
};

describe("FailCiOnControl (AC-6)", () => {
  it("reflects agent.ci_fail_on and patches via useUpdateAgent on click — no new endpoint", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ ci: ciMessages }}>
        <FailCiOnControl agent={AGENT} />
      </NextIntlClientProvider>,
    );

    const group = screen.getByRole("group", { name: /fail ci on/i });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Critical" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Warning+" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Never" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Critical" }));
    expect(mutate).toHaveBeenCalledWith({ id: "ag1", patch: { ci_fail_on: "critical" } });
  });
});

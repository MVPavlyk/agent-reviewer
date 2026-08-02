import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../messages/en/common.json";
import { RunCostBadge, type RunCostBadgeProps } from "./RunCostBadge";
import { formatCost, formatTokenTotal } from "./format";

afterEach(cleanup);

function renderBadge(props: RunCostBadgeProps) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ common }}>
      <RunCostBadge {...props} />
    </NextIntlClientProvider>,
  );
}

describe("formatCost", () => {
  it("keeps 3 significant digits below a dollar", () => {
    expect(formatCost(0.014)).toBe("$0.014");
    expect(formatCost(0.012)).toBe("$0.012");
    expect(formatCost(0.0013)).toBe("$0.0013");
    expect(formatCost(0.00012)).toBe("$0.00012");
  });

  it("never rounds a real cost away to $0.00", () => {
    expect(formatCost(0.0000004)).not.toBe("$0.00");
    expect(formatCost(0.004)).toBe("$0.004");
  });

  it("uses plain cents from a dollar up", () => {
    expect(formatCost(1.2345)).toBe("$1.23");
    expect(formatCost(12.345)).toBe("$12.35");
  });

  it("distinguishes unknown from zero", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
    expect(formatCost(Number.NaN)).toBe("—");
    expect(formatCost(0)).toBe("$0.00");
  });
});

describe("formatTokenTotal", () => {
  it("sums both sides and groups with spaces", () => {
    expect(formatTokenTotal(9000, 119)).toBe("9 119 tok");
    expect(formatTokenTotal(100, null)).toBe("100 tok");
  });

  it("returns null when nothing was recorded, so the caller can omit it", () => {
    expect(formatTokenTotal(null, null)).toBeNull();
    expect(formatTokenTotal(undefined, undefined)).toBeNull();
  });
});

describe("RunCostBadge", () => {
  it("compact renders the cost alone", () => {
    renderBadge({ costUsd: 0.014 });
    expect(screen.getByText("$0.014")).toBeTruthy();
  });

  it("detailed prefixes the token total", () => {
    renderBadge({ costUsd: 0.0013, variant: "detailed", tokensIn: 9000, tokensOut: 119 });
    expect(screen.getByText("9 119 tok · $0.0013")).toBeTruthy();
  });

  it("shows a dash — not $0.00 — for a run with no cost recorded", () => {
    renderBadge({ costUsd: null });
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.queryByText("$0.00")).toBeNull();
  });

  it("omits the token segment when the run recorded none", () => {
    renderBadge({ costUsd: null, variant: "detailed", tokensIn: null, tokensOut: null });
    expect(screen.getByText("—")).toBeTruthy();
  });
});

import { describe, it, expect } from "vitest";
import type { ContextDoc, ContextDocLink } from "@/lib/types";
import { basename, filterDocs, moveItem, sumActiveTokens } from "./helpers";

function doc(path: string, tokens: number, overrides: Partial<ContextDoc> = {}): ContextDoc {
  return {
    path,
    dir_type: "specs",
    size_bytes: tokens * 4,
    tokens,
    content_hash: `hash-${path}`,
    used_by_agents: 0,
    excluded_reason: null,
    ...overrides,
  };
}

function link(path: string, overrides: Partial<ContextDocLink> = {}): ContextDocLink {
  return { path, order: 0, source: "agent", ...overrides };
}

describe("sumActiveTokens", () => {
  it("sums tokens for a plain agent+skill attachment set (SPEC-01 AC-21 mirror)", () => {
    const docs = [doc("specs/a.md", 100), doc("docs/b.md", 50)];
    const links = [link("specs/a.md"), link("docs/b.md", { source: "skill", skill_enabled: true })];
    expect(sumActiveTokens(links, docs)).toBe(150);
  });

  it("counts a duplicate path once, at its first occurrence (AC-34)", () => {
    const docs = [doc("specs/a.md", 100)];
    const links = [
      link("specs/a.md", { source: "skill", skill_enabled: true, skill_name: "Sk1" }),
      link("specs/a.md"),
    ];
    expect(sumActiveTokens(links, docs)).toBe(100);
  });

  it("excludes a document inherited through a disabled skill from the sum (AC-35, mirrors SPEC-01 EC-11)", () => {
    const docs = [doc("specs/a.md", 100), doc("docs/b.md", 50)];
    const links = [
      link("specs/a.md", { source: "skill", skill_enabled: false }),
      link("docs/b.md"),
    ];
    expect(sumActiveTokens(links, docs)).toBe(50);
  });

  it("excludes a missing path (no longer scanned) from the sum", () => {
    const docs = [doc("docs/b.md", 50)];
    const links = [link("specs/gone.md"), link("docs/b.md")];
    expect(sumActiveTokens(links, docs)).toBe(50);
  });

  it("returns 0 for an empty attachment set", () => {
    expect(sumActiveTokens([], [])).toBe(0);
  });
});

describe("moveItem", () => {
  it("moves an item to a valid index", () => {
    expect(moveItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
  });

  it("is a no-op when the target index is out of bounds", () => {
    const arr = ["a", "b"];
    expect(moveItem(arr, 0, -1)).toBe(arr);
    expect(moveItem(arr, 0, 2)).toBe(arr);
  });
});

describe("filterDocs", () => {
  const docs = [doc("specs/security.md", 10), doc("docs/onboarding.md", 20)];

  it("returns everything for an empty query", () => {
    expect(filterDocs(docs, "")).toEqual(docs);
  });

  it("filters case-insensitively by path substring", () => {
    expect(filterDocs(docs, "SECURITY")).toEqual([docs[0]]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterDocs(docs, "nope")).toEqual([]);
  });
});

describe("basename", () => {
  it("returns the last path segment", () => {
    expect(basename("specs/server/SPEC-01.md")).toBe("SPEC-01.md");
  });

  it("returns the whole string when there's no slash", () => {
    expect(basename("README.md")).toBe("README.md");
  });
});

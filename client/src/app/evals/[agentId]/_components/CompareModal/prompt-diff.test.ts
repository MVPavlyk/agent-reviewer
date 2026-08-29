import { describe, it, expect } from "vitest";
import { lineDiff, promptDiff } from "./prompt-diff";

describe("prompt-diff (SPEC-05 AC-63)", () => {
  it("marks unchanged, removed and added lines in the correct read order", () => {
    const a = ["line1", "line2", "line3"];
    const b = ["line1", "lineX", "line3"];

    expect(lineDiff(a, b)).toEqual([
      { kind: "same", text: "line1" },
      { kind: "removed", text: "line2" },
      { kind: "added", text: "lineX" },
      { kind: "same", text: "line3" },
    ]);
  });

  it("marks a trailing addition and a trailing removal", () => {
    const a = ["one", "two"];
    const b = ["one", "two", "three"];
    expect(lineDiff(a, b)).toEqual([
      { kind: "same", text: "one" },
      { kind: "same", text: "two" },
      { kind: "added", text: "three" },
    ]);

    expect(lineDiff(b, a)).toEqual([
      { kind: "same", text: "one" },
      { kind: "same", text: "two" },
      { kind: "removed", text: "three" },
    ]);
  });

  it("two identical texts produce only 'same' lines", () => {
    expect(lineDiff(["x", "y"], ["x", "y"])).toEqual([
      { kind: "same", text: "x" },
      { kind: "same", text: "y" },
    ]);
  });

  it("promptDiff splits full text blobs on newlines before diffing", () => {
    const a = "You are a reviewer.\nBe concise.";
    const b = "You are a reviewer.\nBe thorough.";
    expect(promptDiff(a, b)).toEqual([
      { kind: "same", text: "You are a reviewer." },
      { kind: "removed", text: "Be concise." },
      { kind: "added", text: "Be thorough." },
    ]);
  });
});

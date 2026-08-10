import { describe, it, expect } from "vitest";
import { ApiError } from "./api";
import { fieldErrors } from "./form-errors";

describe("fieldErrors", () => {
  it("parses fastify-type-provider-zod's instancePath shape", () => {
    const err = new ApiError("Request validation failed", 422, "validation_error", [
      { instancePath: "/name", message: "String must contain at least 1 character(s)" },
      { instancePath: "/body", message: "Required" },
    ]);
    expect(fieldErrors(err)).toEqual({
      name: "String must contain at least 1 character(s)",
      body: "Required",
    });
  });

  it("falls back to a raw ZodError's path array shape", () => {
    const err = new ApiError("Request validation failed", 422, "validation_error", [
      { path: ["description"], message: "Required" },
    ]);
    expect(fieldErrors(err)).toEqual({ description: "Required" });
  });

  it("returns {} for a non-422 ApiError (e.g. 404 not_found)", () => {
    const err = new ApiError("Skill not found", 404, "not_found");
    expect(fieldErrors(err)).toEqual({});
  });

  it("returns {} for a network error (not an ApiError)", () => {
    expect(fieldErrors(new Error("fetch failed"))).toEqual({});
  });

  it("returns {} when details is missing or not an array", () => {
    expect(fieldErrors(new ApiError("x", 422, "validation_error"))).toEqual({});
    expect(fieldErrors(new ApiError("x", 422, "validation_error", { not: "an array" }))).toEqual({});
  });
});

import { ApiError } from "./api";

/**
 * Parse a 422 `ApiError` (a zod `schema.body` validation failure — see
 * `server/src/app.ts`'s `hasZodFastifySchemaValidationErrors` branch) into
 * `{ fieldName: message }` so a form can highlight the exact input instead of
 * only surfacing a generic toast. `error.details` is an array of
 * `{ instancePath: "/name", message: "..." }` (fastify-type-provider-zod) —
 * or, for a raw `ZodError` fallback, `{ path: ["name"], message: "..." }`.
 * Any other error shape (404, network, 5xx) yields `{}`; those stay
 * toast-only, which is correct — there's no single field to blame.
 */
export function fieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError) || err.status !== 422 || !Array.isArray(err.details)) return {};

  const out: Record<string, string> = {};
  for (const issue of err.details) {
    if (!issue || typeof issue !== "object") continue;
    const i = issue as { instancePath?: unknown; path?: unknown; message?: unknown };
    const rawPath =
      typeof i.instancePath === "string"
        ? i.instancePath
        : Array.isArray(i.path)
          ? `/${i.path.join("/")}`
          : undefined;
    const field = rawPath?.replace(/^\//, "");
    if (field && typeof i.message === "string") out[field] = i.message;
  }
  return out;
}

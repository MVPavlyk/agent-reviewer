---
name: API Contract Rubric
description: Flags handler responses that drift from their declared schema.
type: rubric
---
Check every changed HTTP handler against its request/response schema:

- A field added to the response type must be optional or backfilled for
  existing clients, unless the endpoint is new this PR.
- A field removed or renamed from the response type is a breaking change —
  flag it CRITICAL unless the diff also bumps an API version.
- Request body validation must reject unknown fields on endpoints marked
  `strict` in the OpenAPI spec.
- A route handler that reads `req.body` without a schema-validated route is
  a WARNING even if the read is safe today.

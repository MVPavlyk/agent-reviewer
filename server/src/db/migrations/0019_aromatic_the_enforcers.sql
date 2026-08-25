ALTER TABLE "ci_installations" ADD COLUMN "ingest_token_hash" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "workflow_version" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "pr_url" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "verdict" text;
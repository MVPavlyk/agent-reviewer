ALTER TABLE "pr_brief" ADD COLUMN "provider" text NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "model" text NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "generated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "source_updated_at" timestamp with time zone;
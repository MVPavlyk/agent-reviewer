ALTER TABLE "pr_intent" RENAME COLUMN "intent" TO "summary";--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "scope" text;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "confidence" text DEFAULT 'high' NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "sources" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "missing_context" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "provider" text NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "model" text NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "generated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "source_updated_at" timestamp with time zone;
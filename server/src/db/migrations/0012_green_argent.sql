CREATE INDEX "pr_commits_pr_id_idx" ON "pr_commits" USING btree ("pr_id");--> statement-breakpoint
CREATE INDEX "pr_files_pr_id_idx" ON "pr_files" USING btree ("pr_id");--> statement-breakpoint
CREATE INDEX "reviews_pr_id_idx" ON "reviews" USING btree ("pr_id");--> statement-breakpoint
CREATE INDEX "reviews_workspace_id_idx" ON "reviews" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agent_runs_pr_id_idx" ON "agent_runs" USING btree ("pr_id");--> statement-breakpoint
CREATE INDEX "agent_runs_workspace_id_idx" ON "agent_runs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agent_runs_agent_id_idx" ON "agent_runs" USING btree ("agent_id");
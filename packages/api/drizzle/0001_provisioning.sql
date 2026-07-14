ALTER TABLE "tenants" ADD COLUMN "addons" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "provisioning_status" text DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "crawl_instructions" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "agent_instructions" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "site_url" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "site_monitor_id" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "repo_provider" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "repo_owner" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "repo_name" text;--> statement-breakpoint
CREATE TABLE "provisioning_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"step" text NOT NULL,
	"status" text NOT NULL,
	"message" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);--> statement-breakpoint
ALTER TABLE "provisioning_log" ADD CONSTRAINT "provisioning_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provisioning_log_tenant_idx" ON "provisioning_log" USING btree ("tenant_id");

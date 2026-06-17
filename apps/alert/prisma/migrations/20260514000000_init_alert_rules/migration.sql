-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "alert";

-- CreateTable
CREATE TABLE "alert"."alert_rules" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "condition_type" TEXT NOT NULL,
    "event_name" TEXT,
    "property_path" TEXT,
    "property_value" TEXT,
    "channel" TEXT NOT NULL,
    "webhook_url" TEXT,
    "slack_webhook_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert"."alert_history" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "triggered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "event_id" TEXT,
    "event_name" TEXT,
    "event_payload" JSONB NOT NULL DEFAULT '{}',
    "notification_status" TEXT NOT NULL,
    "notification_error" TEXT,

    CONSTRAINT "alert_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alert_rules_workspace_id_enabled_idx" ON "alert"."alert_rules"("workspace_id", "enabled");

-- CreateIndex
CREATE INDEX "alert_rules_workspace_id_event_name_idx" ON "alert"."alert_rules"("workspace_id", "event_name");

-- CreateIndex
CREATE INDEX "alert_history_workspace_id_triggered_at_idx" ON "alert"."alert_history"("workspace_id", "triggered_at" DESC);

-- CreateIndex
CREATE INDEX "alert_history_rule_id_idx" ON "alert"."alert_history"("rule_id");

-- AddForeignKey
ALTER TABLE "alert"."alert_history" ADD CONSTRAINT "alert_history_rule_id_fkey"
    FOREIGN KEY ("rule_id") REFERENCES "alert"."alert_rules"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

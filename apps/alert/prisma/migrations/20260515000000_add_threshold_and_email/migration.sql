-- Add count_threshold condition fields
ALTER TABLE "alert"."alert_rules" ADD COLUMN "threshold_count" INTEGER;
ALTER TABLE "alert"."alert_rules" ADD COLUMN "window_seconds" INTEGER;

-- Add email channel field
ALTER TABLE "alert"."alert_rules" ADD COLUMN "recipient_email" TEXT;

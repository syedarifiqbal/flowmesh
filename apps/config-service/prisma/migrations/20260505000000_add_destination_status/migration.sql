ALTER TABLE "config"."destinations"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'untested';

-- CreateTable
CREATE TABLE "pipeline_executions" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "pipeline_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "pipeline_executions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pipeline_executions_workspace_id_idx" ON "pipeline_executions"("workspace_id");

-- CreateIndex
CREATE INDEX "pipeline_executions_event_id_idx" ON "pipeline_executions"("event_id");

-- CreateIndex
CREATE INDEX "pipeline_executions_message_id_idx" ON "pipeline_executions"("message_id");

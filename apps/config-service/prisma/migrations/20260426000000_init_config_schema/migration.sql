-- CreateTable
CREATE TABLE "pipelines" (
    "id"          TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "trigger"     JSONB NOT NULL,
    "steps"       JSONB NOT NULL,
    "enabled"     BOOLEAN NOT NULL DEFAULT true,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "destinations" (
    "id"               TEXT NOT NULL,
    "workspace_id"     TEXT NOT NULL,
    "name"             TEXT NOT NULL,
    "type"             TEXT NOT NULL,
    "encrypted_config" TEXT NOT NULL,
    "iv"               TEXT NOT NULL,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "destinations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pipelines_workspace_id_idx" ON "pipelines"("workspace_id");

-- CreateIndex
CREATE INDEX "destinations_workspace_id_idx" ON "destinations"("workspace_id");

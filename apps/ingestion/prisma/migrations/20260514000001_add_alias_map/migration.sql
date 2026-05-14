-- CreateTable
CREATE TABLE ingestion.alias_map (
    "id"           TEXT        NOT NULL,
    "workspace_id" TEXT        NOT NULL,
    "anonymous_id" TEXT        NOT NULL,
    "user_id"      TEXT        NOT NULL,
    "source"       TEXT        NOT NULL,
    "version"      TEXT        NOT NULL,
    "created_at"   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alias_map_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "alias_map_workspace_id_anonymous_id_key" ON ingestion.alias_map ("workspace_id", "anonymous_id");

-- CreateIndex
CREATE INDEX "alias_map_workspace_id_user_id_idx" ON ingestion.alias_map ("workspace_id", "user_id");

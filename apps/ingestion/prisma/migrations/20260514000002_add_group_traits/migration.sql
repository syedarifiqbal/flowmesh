-- CreateTable
CREATE TABLE ingestion.group_traits (
    "id"           TEXT         NOT NULL,
    "workspace_id" TEXT         NOT NULL,
    "group_id"     TEXT         NOT NULL,
    "user_id"      TEXT         NOT NULL,
    "traits"       JSONB        NOT NULL DEFAULT '{}',
    "source"       TEXT         NOT NULL,
    "version"      TEXT         NOT NULL,
    "created_at"   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_traits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "group_traits_workspace_id_group_id_user_id_key" ON ingestion.group_traits ("workspace_id", "group_id", "user_id");

-- CreateIndex
CREATE INDEX "group_traits_workspace_id_group_id_idx" ON ingestion.group_traits ("workspace_id", "group_id");

-- CreateIndex
CREATE INDEX "group_traits_workspace_id_user_id_idx" ON ingestion.group_traits ("workspace_id", "user_id");

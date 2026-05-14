-- CreateTable
CREATE TABLE ingestion.user_traits (
    "id"           TEXT         NOT NULL,
    "workspace_id" TEXT         NOT NULL,
    "user_id"      TEXT         NOT NULL,
    "anonymous_id" TEXT,
    "traits"       JSONB        NOT NULL DEFAULT '{}',
    "source"       TEXT         NOT NULL,
    "version"      TEXT         NOT NULL,
    "created_at"   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_traits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_traits_workspace_id_user_id_key" ON ingestion.user_traits ("workspace_id", "user_id");

-- CreateIndex
CREATE INDEX "user_traits_workspace_id_user_id_idx" ON ingestion.user_traits ("workspace_id", "user_id");

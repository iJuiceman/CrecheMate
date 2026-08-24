-- Append-only audit log: one row per audited API request (all mutations,
-- including denied/failed ones, plus sensitive detail reads). Bodies are
-- stored redacted at the app layer before they reach this table.
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" TEXT,
    "actor_username" TEXT,
    "actor_role" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_id" TEXT,
    "status" INTEGER NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "detail" JSONB,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_at_idx" ON "audit_logs"("at");
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

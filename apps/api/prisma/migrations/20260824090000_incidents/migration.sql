-- Incident log: staff record incidents they noticed or that a parent reported
-- at the desk — tick-box categories plus free-text details (encrypted at the
-- app layer, since they may describe a child's injuries/health).
CREATE TYPE "IncidentReporter" AS ENUM ('staff', 'parent');

CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "child_id" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "reported_by" "IncidentReporter" NOT NULL DEFAULT 'staff',
    "reporter_name" TEXT,
    "types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description_encrypted" TEXT,
    "logged_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "incidents_occurred_at_idx" ON "incidents"("occurred_at");
CREATE INDEX "incidents_child_id_idx" ON "incidents"("child_id");

ALTER TABLE "incidents" ADD CONSTRAINT "incidents_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE SET NULL ON UPDATE CASCADE;

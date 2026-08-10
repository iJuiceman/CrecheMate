-- Enforce a single facility-settings row. Duplicates (from a boot-time race)
-- are already collapsed; this makes a second row impossible going forward.
ALTER TABLE "facility_settings" ADD COLUMN "singleton" BOOLEAN NOT NULL DEFAULT true;
CREATE UNIQUE INDEX "facility_settings_singleton_key" ON "facility_settings"("singleton");

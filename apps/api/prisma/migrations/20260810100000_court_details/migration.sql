-- Which court a parent is on while their child is in care.
ALTER TABLE "attendances" ADD COLUMN "court" TEXT;

-- The club's courts, offered as a pick-list at check-in.
ALTER TABLE "facility_settings" ADD COLUMN "courts" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

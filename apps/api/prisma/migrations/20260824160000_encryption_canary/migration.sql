-- Encryption key canary: a known sentinel encrypted with the app's
-- CHILD_DATA_ENCRYPTION_KEY, verified on boot so a wrong/rotated key is caught
-- loudly instead of silently returning empty medical notes / signatures.
ALTER TABLE "facility_settings" ADD COLUMN "encryption_canary" TEXT;

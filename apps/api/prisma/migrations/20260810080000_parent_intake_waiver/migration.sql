-- Waiver shown on the parent self-registration form (admin-editable, versioned).
ALTER TABLE "facility_settings" ADD COLUMN "waiver_text" TEXT;
ALTER TABLE "facility_settings" ADD COLUMN "waiver_version" INTEGER NOT NULL DEFAULT 1;

-- Signed-waiver record captured when a parent self-registers. Signature image
-- is stored encrypted at the app layer.
ALTER TABLE "guardians" ADD COLUMN "waiver_signature_encrypted" TEXT;
ALTER TABLE "guardians" ADD COLUMN "waiver_accepted_at" TIMESTAMP(3);
ALTER TABLE "guardians" ADD COLUMN "waiver_version" INTEGER;

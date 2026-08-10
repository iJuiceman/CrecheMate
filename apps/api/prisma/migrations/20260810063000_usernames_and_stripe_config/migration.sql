-- Users log in by username; email becomes optional (records/receipts only).
-- Add nullable first, backfill from the email local-part for existing accounts,
-- then enforce NOT NULL + uniqueness.
ALTER TABLE "users" ADD COLUMN "username" TEXT;
UPDATE "users" SET "username" = split_part("email", '@', 1)
  WHERE "username" IS NULL AND "email" IS NOT NULL AND split_part("email", '@', 1) <> '';
UPDATE "users" SET "username" = 'user_' || substr("id"::text, 1, 8)
  WHERE "username" IS NULL;
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
DROP INDEX IF EXISTS "users_email_key";
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- Stripe configuration on the single facility (secret key stored encrypted).
ALTER TABLE "facility_settings" ADD COLUMN "stripe_secret_key_encrypted" TEXT;
ALTER TABLE "facility_settings" ADD COLUMN "stripe_publishable_key" TEXT;

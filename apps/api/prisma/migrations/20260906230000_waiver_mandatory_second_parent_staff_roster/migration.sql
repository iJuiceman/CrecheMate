-- Waiver method + second parent on guardians
ALTER TABLE "guardians" ADD COLUMN "waiver_method" TEXT;
ALTER TABLE "guardians" ADD COLUMN "second_first_name" TEXT;
ALTER TABLE "guardians" ADD COLUMN "second_last_name" TEXT;
ALTER TABLE "guardians" ADD COLUMN "second_relationship" TEXT;
ALTER TABLE "guardians" ADD COLUMN "second_phone" TEXT;
ALTER TABLE "guardians" ADD COLUMN "second_email" TEXT;

-- Existing signatures were collected by finger on the kiosk
UPDATE "guardians" SET "waiver_method" = 'signed' WHERE "waiver_signature_encrypted" IS NOT NULL;

-- Online-booking waiver acknowledgement
ALTER TABLE "booking_requests" ADD COLUMN "waiver_accepted_at" TIMESTAMP(3);
ALTER TABLE "booking_requests" ADD COLUMN "waiver_version" INTEGER;

-- Staff roster (creche operator shifts)
CREATE TABLE "roster_shifts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "roster_shifts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "roster_shifts_start_at_idx" ON "roster_shifts"("start_at");
CREATE INDEX "roster_shifts_user_id_idx" ON "roster_shifts"("user_id");
ALTER TABLE "roster_shifts" ADD CONSTRAINT "roster_shifts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

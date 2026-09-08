-- Refund stamp on booking prepayments (finance keys money-out on it)
ALTER TABLE "booking_requests" ADD COLUMN "refunded_at" TIMESTAMP(3);

-- Account lockout
ALTER TABLE "users" ADD COLUMN "failed_login_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "locked_until" TIMESTAMP(3);

-- Roster shift hygiene: DB-enforced window ordering + a real FK on created_by
ALTER TABLE "roster_shifts" ADD CONSTRAINT "roster_shifts_window_check" CHECK ("end_at" > "start_at");
ALTER TABLE "roster_shifts" ADD CONSTRAINT "roster_shifts_created_by_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Legacy authorise-hold cleanup: requests confirmed under the old model whose
-- capture never stamped paid (L8) — the money WAS captured at confirm time.
UPDATE "booking_requests"
SET "payment_status" = 'paid', "paid_at" = COALESCE("decided_at", "created_at")
WHERE "status" = 'confirmed' AND "payment_status" = 'authorized' AND "paid_at" IS NULL;

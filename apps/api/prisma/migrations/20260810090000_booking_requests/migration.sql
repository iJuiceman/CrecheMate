-- Parent booking requests (external, staff-confirmed, prepaid).
CREATE TYPE "BookingRequestStatus" AS ENUM ('pending', 'confirmed', 'declined', 'cancelled');

CREATE TABLE "booking_requests" (
    "id" TEXT NOT NULL,
    "parent_first_name" TEXT NOT NULL,
    "parent_last_name" TEXT NOT NULL,
    "parent_phone" TEXT NOT NULL,
    "parent_email" TEXT,
    "child_first_name" TEXT NOT NULL,
    "child_last_name" TEXT NOT NULL,
    "child_birth_month" INTEGER,
    "child_birth_year" INTEGER,
    "requested_start" TIMESTAMP(3) NOT NULL,
    "requested_end" TIMESTAMP(3) NOT NULL,
    "fee_cents" INTEGER NOT NULL,
    "notes" TEXT,
    "status" "BookingRequestStatus" NOT NULL DEFAULT 'pending',
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'unpaid',
    "stripe_payment_intent_id" TEXT,
    "paid_at" TIMESTAMP(3),
    "attendance_id" TEXT,
    "child_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "decided_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "booking_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "booking_requests_attendance_id_key" ON "booking_requests"("attendance_id");
CREATE INDEX "booking_requests_status_idx" ON "booking_requests"("status");

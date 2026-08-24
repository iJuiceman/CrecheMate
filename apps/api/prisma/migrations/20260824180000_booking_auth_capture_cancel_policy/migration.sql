-- Booking flow change: parents' cards are AUTHORISED (held) at booking and
-- CAPTURED only when staff approve; declines void the hold (no refund). Plus a
-- configurable late-cancellation refund policy.

-- New payment status for a placed-but-not-captured card hold.
ALTER TYPE "PaymentStatus" ADD VALUE 'authorized' BEFORE 'paid';

-- Track money refunded when a paid booking is cancelled (late-cancel policy).
ALTER TABLE "attendances"
  ADD COLUMN "refunded_cents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "refunded_at" TIMESTAMP(3);

-- Cancellation policy knobs (facility singleton).
ALTER TABLE "facility_settings"
  ADD COLUMN "late_cancel_window_hours" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN "late_cancel_refund_percent" INTEGER NOT NULL DEFAULT 50;

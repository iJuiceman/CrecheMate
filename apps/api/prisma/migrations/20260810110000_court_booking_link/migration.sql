-- Name the court is booked under (when different from the creche/parent).
ALTER TABLE "attendances" ADD COLUMN "court_booking_name" TEXT;

-- Court booking a parent's external creche request is attached to.
ALTER TABLE "booking_requests" ADD COLUMN "court" TEXT;
ALTER TABLE "booking_requests" ADD COLUMN "court_booking_name" TEXT;

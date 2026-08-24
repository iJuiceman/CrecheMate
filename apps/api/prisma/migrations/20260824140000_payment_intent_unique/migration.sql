-- Replay guard: a given Stripe PaymentIntent may settle at most one attendance
-- and at most one booking request. Postgres unique indexes permit multiple
-- NULLs, so unpaid rows and cash/eftpos payments (which store NULL here) are
-- unaffected. Paired with the server-side metadata reference check in
-- PaymentsService, this stops one payment from marking many fees paid.
CREATE UNIQUE INDEX "attendances_stripe_payment_intent_id_key" ON "attendances"("stripe_payment_intent_id");
CREATE UNIQUE INDEX "booking_requests_stripe_payment_intent_id_key" ON "booking_requests"("stripe_payment_intent_id");

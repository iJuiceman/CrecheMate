-- CreateTable
CREATE TABLE "booking_request_children" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "birth_month" INTEGER,
    "birth_year" INTEGER,
    "fee_cents" INTEGER NOT NULL,
    "child_id" TEXT,
    "attendance_id" TEXT,

    CONSTRAINT "booking_request_children_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "booking_request_children_attendance_id_key" ON "booking_request_children"("attendance_id");

-- CreateIndex
CREATE INDEX "booking_request_children_request_id_idx" ON "booking_request_children"("request_id");

-- AddForeignKey
ALTER TABLE "booking_request_children" ADD CONSTRAINT "booking_request_children_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "booking_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;


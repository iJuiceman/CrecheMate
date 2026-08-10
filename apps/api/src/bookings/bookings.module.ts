import { Module } from "@nestjs/common";
import { BookingsController } from "./bookings.controller";
import { BookingsService } from "./bookings.service";
import { AttendanceModule } from "../attendance/attendance.module";

@Module({
  imports: [AttendanceModule],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}

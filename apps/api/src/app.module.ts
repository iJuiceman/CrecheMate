import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard, RolesGuard } from "./auth/guards";
import { UsersModule } from "./users/users.module";
import { FamiliesModule } from "./families/families.module";
import { AttendanceModule } from "./attendance/attendance.module";
import { SettingsModule } from "./settings/settings.module";
import { PaymentsModule } from "./payments/payments.module";
import { IntakeModule } from "./intake/intake.module";
import { BookingsModule } from "./bookings/bookings.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate limit for the internet-facing public routes (intake + bookings).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }]),
    PrismaModule,
    PaymentsModule,
    SettingsModule,
    AuthModule,
    UsersModule,
    FamiliesModule,
    AttendanceModule,
    IntakeModule,
    BookingsModule,
  ],
  providers: [
    // Every route requires a signed-in staff member unless marked @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}

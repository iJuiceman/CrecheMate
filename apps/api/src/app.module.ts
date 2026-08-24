import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
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
import { ReportsModule } from "./reports/reports.module";
import { IncidentsModule } from "./incidents/incidents.module";
import { FinanceModule } from "./finance/finance.module";
import { AuditModule } from "./audit/audit.module";
import { EncryptionHealthService } from "./common/encryption-health.service";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Global rate limit (per client IP). This generous default caps line-rate
    // request floods against ANY route — including unauthenticated hits on
    // protected routes, which would otherwise write an audit row each. The
    // sensitive public write routes (login, first-admin, intake, bookings)
    // set much tighter per-route limits via @Throttle.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    PaymentsModule,
    SettingsModule,
    AuthModule,
    UsersModule,
    FamiliesModule,
    AttendanceModule,
    IntakeModule,
    BookingsModule,
    ReportsModule,
    IncidentsModule,
    FinanceModule,
    AuditModule,
  ],
  providers: [
    // Order matters: throttle FIRST, so an unauthenticated flood on a protected
    // route is rate-limited before the JWT guard would 401 (and audit) it.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Every route requires a signed-in staff member unless marked @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    EncryptionHealthService,
  ],
})
export class AppModule {}

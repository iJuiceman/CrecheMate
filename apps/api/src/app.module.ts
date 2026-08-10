import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard, RolesGuard } from "./auth/guards";
import { UsersModule } from "./users/users.module";
import { FamiliesModule } from "./families/families.module";
import { AttendanceModule } from "./attendance/attendance.module";
import { SettingsModule } from "./settings/settings.module";
import { PaymentsModule } from "./payments/payments.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    PaymentsModule,
    SettingsModule,
    AuthModule,
    UsersModule,
    FamiliesModule,
    AttendanceModule,
  ],
  providers: [
    // Every route requires a signed-in staff member unless marked @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}

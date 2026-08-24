import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { AuditController } from "./audit.controller";
import { AuditMiddleware } from "./audit.middleware";
import { AuditService } from "./audit.service";

@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditMiddleware],
})
export class AuditModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuditMiddleware).forRoutes("*");
  }
}

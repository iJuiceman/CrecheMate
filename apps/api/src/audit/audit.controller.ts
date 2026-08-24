import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { Roles } from "../auth/decorators";
import { RolesGuard } from "../auth/guards";

// The audit trail is read-only and admin-only. There is deliberately no
// endpoint to edit or delete entries — it's append-only by construction.
@Controller("audit")
@UseGuards(RolesGuard)
@Roles("admin")
export class AuditController {
  constructor(private audit: AuditService) {}

  @Get()
  list(
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("actorId") actorId?: string,
    @Query("action") action?: string,
    @Query("errorsOnly") errorsOnly?: string,
    @Query("page") page?: string,
  ) {
    return this.audit.list({ from, to, actorId, action, errorsOnly, page });
  }
}

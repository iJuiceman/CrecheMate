import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { AuditService } from "./audit.service";

// Middleware (not an interceptor) so DENIED requests are captured too:
// guards run before interceptors, so a 401/403 would never reach one, but
// the response-finish event fires for every request. By finish time the JWT
// guard has attached req.user for authenticated calls, so the actor is known.
@Injectable()
export class AuditMiddleware implements NestMiddleware {
  constructor(private audit: AuditService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const path = (req.originalUrl ?? req.url).split("?")[0];
    if (this.audit.shouldLog(req.method, path)) {
      const started = Date.now();
      // Record on whichever fires first: "finish" (normal response) OR "close"
      // (client aborted the socket before the response flushed). Without the
      // "close" listener, a handler that mutates then has its connection dropped
      // would leave no audit trail. Guard so we only write once.
      let logged = false;
      const done = () => {
        if (logged) return;
        logged = true;
        this.audit.record(req, res.statusCode, Date.now() - started);
      };
      res.on("finish", done);
      res.on("close", done);
    }
    next();
  }
}

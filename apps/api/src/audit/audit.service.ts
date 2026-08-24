import { BadRequestException, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { DateTime } from "luxon";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { JwtPayload } from "../auth/jwt-payload.interface";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Body keys whose values must never reach the audit table in the clear —
// they're either secrets or data the main tables keep encrypted.
const REDACT_KEYS = new Set([
  "password", "currentpassword", "newpassword", "temporarypassword",
  "secretkey", "publishablekey",
  "medicalnotes", "waiversignature", "signature",
]);
// Per-path extras: incident details are health data (encrypted in incidents).
const REDACT_BY_PATH: { prefix: string; keys: string[] }[] = [
  { prefix: "/incidents", keys: ["description"] },
];

const MAX_STRING = 300; // clip long free text (waivers etc.) — audit, not backup
const MAX_DEPTH = 5;
const MAX_DETAIL_BYTES = 8_000; // hard cap on stored request detail per row
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AuditService implements OnModuleInit, OnModuleDestroy {
  private pruneTimer?: ReturnType<typeof setInterval>;

  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
  ) {}

  /** Prune on boot, then daily, so the append-only log can't grow forever. */
  onModuleInit() {
    void this.pruneOld();
    this.pruneTimer = setInterval(() => void this.pruneOld(), DAY_MS);
    this.pruneTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.pruneTimer) clearInterval(this.pruneTimer);
  }

  /** Delete entries older than AUDIT_RETENTION_DAYS (default 730 = ~2 years). */
  async pruneOld(): Promise<void> {
    const days = Number(process.env.AUDIT_RETENTION_DAYS) || 730;
    const cutoff = new Date(Date.now() - days * DAY_MS);
    try {
      await this.prisma.auditLog.deleteMany({ where: { at: { lt: cutoff } } });
    } catch {
      // pruning is best-effort; never throw from a background timer
    }
  }

  /** Every mutation is audited; reads only where they expose sensitive detail. */
  shouldLog(method: string, path: string): boolean {
    if (method === "POST" || method === "PATCH" || method === "PUT" || method === "DELETE") return true;
    // Viewing a family record shows decrypted medical notes + the signature.
    if (method === "GET" && /^\/families\/[0-9a-f-]{36}$/i.test(path)) return true;
    // The families list is a facility-wide export of guardian/child PII.
    if (method === "GET" && path === "/families") return true;
    return false;
  }

  /** Fire-and-forget: auditing must never break or slow the request itself. */
  record(req: Request, status: number, durationMs: number): void {
    try {
      const user = (req as Request & { user?: JwtPayload }).user;
      const path = (req.originalUrl ?? req.url).split("?")[0];
      const segments = path.split("/").filter(Boolean);
      const targetId = segments.find((s) => UUID.test(s)) ?? null;
      const action = `${req.method} /${segments.filter((s) => !UUID.test(s)).join("/")}`;

      // Store the request payload ONLY for authenticated, non-denied requests.
      // Unauthenticated or 401/403 requests still leave an accountability row
      // (who/what/when/status/ip) but never persist their attacker-controlled
      // body/query — that's what stopped the audit table being a flood target.
      let detail: Record<string, unknown> | undefined;
      if (user && status !== 401 && status !== 403) {
        const d: Record<string, unknown> = {};
        const body = this.sanitize(req.body, path);
        if (body && Object.keys(body).length) d.body = body;
        const query = this.sanitize(req.query, path);
        if (query && Object.keys(query).length) d.query = query;
        // Belt-and-braces cap on the serialized size of a single row's detail.
        if (Object.keys(d).length) {
          detail = JSON.stringify(d).length > MAX_DETAIL_BYTES ? { truncated: true } : d;
        }
      }

      void this.prisma.auditLog
        .create({
          data: {
            actorId: user?.sub ?? null,
            actorUsername: user?.username ?? null,
            actorRole: user?.role ?? null,
            ip: req.ip ?? null,
            userAgent: (req.headers["user-agent"] ?? "").toString().slice(0, 300) || null,
            method: req.method,
            path,
            action,
            targetId,
            status,
            durationMs,
            detail: detail as object | undefined,
          },
        })
        .catch(() => {});
    } catch {
      // Never let auditing throw into the request pipeline.
    }
  }

  private sanitize(value: unknown, path: string, depth = 0): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const extra = new Set(
      REDACT_BY_PATH.filter((r) => path.startsWith(r.prefix)).flatMap((r) => r.keys),
    );
    const walk = (v: unknown, d: number): unknown => {
      if (v === null || v === undefined) return v;
      if (typeof v === "string") return v.length > MAX_STRING ? `${v.slice(0, MAX_STRING)}… [+${v.length - MAX_STRING} chars]` : v;
      if (typeof v !== "object") return v;
      if (d >= MAX_DEPTH) return "[nested]";
      if (Array.isArray(v)) return v.slice(0, 50).map((x) => walk(x, d + 1));
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) {
        const key = k.toLowerCase();
        out[k] = REDACT_KEYS.has(key) || extra.has(key) ? "[redacted]" : walk(val, d + 1);
      }
      return out;
    };
    return walk(value, depth) as Record<string, unknown>;
  }

  async list(q: {
    from?: string;
    to?: string;
    actorId?: string;
    action?: string;
    errorsOnly?: string;
    page?: string;
  }) {
    const f = await this.settings.get();
    const tz = f.timezone;
    const parse = (v: string, label: string) => {
      const d = DateTime.fromISO(v, { zone: tz });
      if (!d.isValid) throw new BadRequestException(`Invalid ${label} date`);
      return d;
    };
    const start = q.from ? parse(q.from, "from").startOf("day").toJSDate() : undefined;
    const end = q.to ? parse(q.to, "to").startOf("day").plus({ days: 1 }).toJSDate() : undefined;
    const page = Math.max(0, parseInt(q.page ?? "0", 10) || 0);
    const pageSize = 50;

    const where = {
      ...(start || end ? { at: { ...(start ? { gte: start } : {}), ...(end ? { lt: end } : {}) } } : {}),
      ...(q.actorId === "public" ? { actorId: null } : q.actorId ? { actorId: q.actorId } : {}),
      ...(q.action ? { action: { contains: q.action, mode: "insensitive" as const } } : {}),
      ...(q.errorsOnly === "true" ? { status: { gte: 400 } } : {}),
    };

    const [total, rows, staff] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({ where, orderBy: { at: "desc" }, skip: page * pageSize, take: pageSize }),
      this.prisma.user.findMany({ select: { id: true, firstName: true, lastName: true } }),
    ]);
    const names = new Map(staff.map((s) => [s.id, `${s.firstName} ${s.lastName}`]));

    return {
      total,
      page,
      pageSize,
      rows: rows.map((r) => ({
        id: r.id,
        at: r.at,
        actorId: r.actorId,
        actor: r.actorId ? names.get(r.actorId) ?? r.actorUsername ?? "—" : null,
        actorUsername: r.actorUsername,
        actorRole: r.actorRole,
        ip: r.ip,
        userAgent: r.userAgent,
        method: r.method,
        path: r.path,
        action: r.action,
        targetId: r.targetId,
        status: r.status,
        durationMs: r.durationMs,
        detail: r.detail,
      })),
    };
  }
}

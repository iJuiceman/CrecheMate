"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AuditEntry, AuditList } from "@/lib/types";

interface StaffOption { id: string; firstName: string; lastName: string }

const isoDaysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-CA");
};
const today = () => new Date().toLocaleDateString("en-CA");

export default function AuditPage() {
  const [from, setFrom] = useState(isoDaysAgo(6));
  const [to, setTo] = useState(today());
  const [actorId, setActorId] = useState("");
  const [action, setAction] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    api.get<StaffOption[]>("/staff").then(setStaff).catch(() => {});
  }, []);

  const load = useCallback((p: number, append: boolean) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ from, to, page: String(p) });
    if (actorId) params.set("actorId", actorId);
    if (action.trim()) params.set("action", action.trim());
    if (errorsOnly) params.set("errorsOnly", "true");
    api.get<AuditList>(`/audit?${params}`)
      .then((d) => {
        setRows((prev) => (append ? [...prev, ...d.rows] : d.rows));
        setTotal(d.total);
        setPage(p);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load the audit log."))
      .finally(() => setLoading(false));
  }, [from, to, actorId, action, errorsOnly]);

  useEffect(() => { load(0, false); }, [load]);

  const statusTone = (s: number) =>
    s >= 500 ? "bg-coral/15 text-coral" : s >= 400 ? "bg-coral/10 text-coral" : "bg-teal-light text-teal-dark";

  return (
    <div className="p-6">
      <h1 className="font-display text-2xl font-bold text-ink">Audit log</h1>
      <p className="mt-1 text-sm text-ink/60">
        Every change made through the app — who, what, when, from where — including denied and failed attempts.
        Append-only: entries can&apos;t be edited or deleted, and sensitive values (passwords, medical notes, signatures) are never stored.
      </p>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-card border border-line bg-white p-3">
        <div><label className="label">From</label><input type="date" className="field" max={to} value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="label">To</label><input type="date" className="field" min={from} max={today()} value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div>
          <label className="label">Who</label>
          <select className="field" value={actorId} onChange={(e) => setActorId(e.target.value)}>
            <option value="">Everyone</option>
            <option value="public">Public (no login)</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Action contains</label>
          <input className="field" placeholder="e.g. attendance, login, DELETE" value={action} onChange={(e) => setAction(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-ink">
          <input type="checkbox" className="h-5 w-5 rounded border-line text-teal focus:ring-teal" checked={errorsOnly} onChange={(e) => setErrorsOnly(e.target.checked)} />
          Failures only
        </label>
        <p className="ml-auto pb-2 text-xs text-ink/50">{total} entr{total === 1 ? "y" : "ies"}</p>
      </div>

      {error && <p className="mt-4 rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p>}

      <div className="mt-4 overflow-x-auto rounded-card border border-line bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase text-ink/40">
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Who</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">IP</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Row key={r.id} r={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} statusTone={statusTone} />
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-ink/40">Nothing matches these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-center gap-3">
        {loading && <p className="text-sm text-ink/40">Loading…</p>}
        {!loading && rows.length < total && (
          <button className="btn-secondary" onClick={() => load(page + 1, true)}>Load more ({total - rows.length} older)</button>
        )}
      </div>
    </div>
  );
}

function Row({ r, open, onToggle, statusTone }: {
  r: AuditEntry; open: boolean; onToggle: () => void; statusTone: (s: number) => string;
}) {
  return (
    <>
      <tr className="cursor-pointer border-b border-line last:border-0 hover:bg-sand/60" onClick={onToggle}>
        <td className="whitespace-nowrap px-3 py-2 text-ink/70">
          {new Date(r.at).toLocaleString("en-AU", { dateStyle: "short", timeStyle: "medium" })}
        </td>
        <td className="px-3 py-2">
          {r.actor ? (
            <span className="text-ink">{r.actor} <span className="text-xs text-ink/40">({r.actorRole})</span></span>
          ) : (
            <span className="text-ink/50">Public{r.actorUsername ? ` (${r.actorUsername})` : ""}</span>
          )}
        </td>
        <td className="px-3 py-2 font-mono text-xs text-ink">{r.action}</td>
        <td className="px-3 py-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone(r.status)}`}>{r.status}</span>
        </td>
        <td className="px-3 py-2 font-mono text-xs text-ink/50">{r.ip ?? ""}</td>
        <td className="px-3 py-2 text-xs text-ink/40">{open ? "▲" : "▼"}</td>
      </tr>
      {open && (
        <tr className="border-b border-line bg-sand/40 last:border-0">
          <td colSpan={6} className="px-4 py-3">
            <div className="grid gap-2 text-xs md:grid-cols-2">
              <div className="space-y-1">
                <p><span className="text-ink/50">Full path:</span> <span className="font-mono text-ink">{r.method} {r.path}</span></p>
                {r.targetId && <p><span className="text-ink/50">Record id:</span> <span className="font-mono text-ink">{r.targetId}</span></p>}
                <p><span className="text-ink/50">Duration:</span> <span className="text-ink">{r.durationMs} ms</span></p>
                {r.userAgent && <p className="break-all"><span className="text-ink/50">Client:</span> <span className="text-ink/70">{r.userAgent}</span></p>}
              </div>
              <div>
                <p className="mb-1 text-ink/50">Request detail (sensitive values redacted):</p>
                <pre className="max-h-64 overflow-auto rounded-lg border border-line bg-white p-2 font-mono text-[11px] leading-relaxed text-ink/80">
                  {r.detail ? JSON.stringify(r.detail, null, 2) : "—"}
                </pre>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

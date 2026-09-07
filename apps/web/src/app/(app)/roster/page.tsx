"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { RosterShift, StaffRosterWeek } from "@/lib/types";

interface StaffRow { id: string; firstName: string; lastName: string; role: string; status: string }

const DAY_MS = 86_400_000;
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true });
const dateKey = (d: Date) => d.toLocaleDateString("en-CA");

function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7; // Mon=0
  x.setDate(x.getDate() - day);
  return x;
}

// The creche-operator roster: who is scheduled to run the creche each day.
// Everyone can view it; admins schedule, move and remove shifts.
export default function RosterPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
  const [week, setWeek] = useState<StaffRosterWeek | null>(null);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RosterShift | { date: string } | null>(null);

  const load = useCallback(() => {
    const from = dateKey(weekStart);
    const to = dateKey(new Date(weekStart.getTime() + 6 * DAY_MS));
    api.get<StaffRosterWeek>(`/staff-roster?from=${from}&to=${to}`).then(setWeek).catch((e) => setError(e.message));
  }, [weekStart]);
  useEffect(load, [load]);
  useEffect(() => {
    if (isAdmin) api.get<StaffRow[]>("/staff").then((s) => setStaff(s.filter((x) => x.status === "active"))).catch(() => {});
  }, [isAdmin]);

  const days: Date[] = [];
  for (let i = 0; i < 7; i++) days.push(new Date(weekStart.getTime() + i * DAY_MS));
  const todayKey = dateKey(new Date());
  const shiftsFor = (d: Date) => (week?.shifts ?? []).filter((s) => dateKey(new Date(s.startAt)) === dateKey(d));

  async function remove(id: string) {
    if (!confirm("Remove this shift?")) return;
    try { await api.del(`/staff-roster/${id}`); load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't remove the shift."); }
  }

  const weekLabel = `${weekStart.toLocaleDateString("en-AU", { day: "numeric", month: "short" })} – ${new Date(weekStart.getTime() + 6 * DAY_MS).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <div className="p-6">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink">Creche roster</h1>
        <div className="flex items-center gap-2">
          <button className="btn-secondary px-3 py-1.5 text-sm" onClick={() => setWeekStart(new Date(weekStart.getTime() - 7 * DAY_MS))}>← Prev</button>
          <button className="btn-secondary px-3 py-1.5 text-sm" onClick={() => setWeekStart(mondayOf(new Date()))}>This week</button>
          <button className="btn-secondary px-3 py-1.5 text-sm" onClick={() => setWeekStart(new Date(weekStart.getTime() + 7 * DAY_MS))}>Next →</button>
        </div>
      </div>
      <p className="mb-4 text-sm text-ink/60">Who is rostered to run the creche · {weekLabel}</p>
      {error && <p className="mb-4 rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p>}

      <div className="grid gap-2 md:grid-cols-7">
        {days.map((d) => {
          const isToday = dateKey(d) === todayKey;
          const shifts = shiftsFor(d);
          return (
            <div key={d.toISOString()} className={`rounded-card border p-2 ${isToday ? "border-teal bg-teal-light/30" : "border-line bg-white"}`}>
              <p className={`text-xs font-semibold ${isToday ? "text-teal-dark" : "text-ink/60"}`}>
                {d.toLocaleDateString("en-AU", { weekday: "short" })} <span className="font-normal">{d.getDate()}</span>
                {isToday && <span className="ml-1 rounded-full bg-teal px-1.5 py-0.5 text-[9px] font-bold text-white">TODAY</span>}
              </p>
              <div className="mt-2 space-y-1.5">
                {shifts.map((s) => (
                  <div key={s.id} className="rounded-lg bg-teal-light/60 px-2 py-1.5">
                    <p className="text-xs font-semibold text-teal-dark">{s.user?.name ?? "—"}</p>
                    <p className="text-[11px] text-ink/60">{fmtTime(s.startAt)} – {fmtTime(s.endAt)}</p>
                    {s.notes && <p className="text-[11px] text-ink/50">{s.notes}</p>}
                    {isAdmin && (
                      <p className="mt-0.5 flex gap-2 text-[11px]">
                        <button className="font-medium text-teal hover:underline" onClick={() => setEditing(s)}>Edit</button>
                        <button className="font-medium text-coral hover:underline" onClick={() => remove(s.id)}>Remove</button>
                      </p>
                    )}
                  </div>
                ))}
                {shifts.length === 0 && <p className="text-[11px] text-ink/30">No one rostered</p>}
                {isAdmin && (
                  <button className="w-full rounded-lg border border-dashed border-line py-1 text-[11px] font-medium text-teal hover:bg-teal-light/30" onClick={() => setEditing({ date: dateKey(d) })}>
                    + Add
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!isAdmin && <p className="mt-4 text-xs text-ink/40">Only an admin can change the roster.</p>}

      {editing && (
        <ShiftForm
          staff={staff}
          shift={"id" in editing ? editing : undefined}
          defaultDate={"id" in editing ? dateKey(new Date(editing.startAt)) : editing.date}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function ShiftForm({ staff, shift, defaultDate, onClose, onSaved }: {
  staff: StaffRow[];
  shift?: RosterShift;
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toTime = (iso?: string) => (iso ? new Date(iso).toTimeString().slice(0, 5) : "");
  const [f, setF] = useState({
    userId: shift?.userId ?? "",
    date: defaultDate,
    start: toTime(shift?.startAt) || "09:00",
    end: toTime(shift?.endAt) || "13:00",
    notes: shift?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!f.userId) return setErr("Pick a staff member.");
    setBusy(true); setErr(null);
    const body = {
      userId: f.userId,
      startAt: new Date(`${f.date}T${f.start}:00`).toISOString(),
      endAt: new Date(`${f.date}T${f.end}:00`).toISOString(),
      notes: f.notes.trim() || undefined,
    };
    try {
      if (shift) await api.patch(`/staff-roster/${shift.id}`, body);
      else await api.post("/staff-roster", body);
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't save the shift."); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-card bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-lg font-bold text-ink">{shift ? "Edit shift" : "Roster a shift"}</h2>
        <div className="mt-3 space-y-2">
          <div>
            <label className="label">Staff member (creche operator)</label>
            <select className="field" value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })}>
              <option value="">Choose…</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}{s.role === "admin" ? " (admin)" : ""}</option>)}
            </select>
          </div>
          <div><label className="label">Date</label><input type="date" className="field" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">From</label><input type="time" className="field" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></div>
            <div><label className="label">To</label><input type="time" className="field" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></div>
          </div>
          <div><label className="label">Notes (optional)</label><input className="field" placeholder="e.g. covering for Sam" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
        </div>
        {err && <p className="mt-3 text-sm text-coral">{err}</p>}
        <div className="mt-4 flex gap-2">
          <button className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
          <button className="btn flex-1" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

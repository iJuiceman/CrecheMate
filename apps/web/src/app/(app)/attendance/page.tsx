"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Attendance, money } from "@/lib/types";

function fmtTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true }) : "—";
}
const STATUS: Record<string, string> = {
  booked: "bg-teal-light text-teal-dark",
  checked_in: "bg-teal text-white",
  checked_out: "bg-line text-ink/70",
  cancelled: "bg-coral/10 text-coral",
  no_show: "bg-coral/10 text-coral",
};

export default function AttendancePage() {
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [rows, setRows] = useState<Attendance[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get<Attendance[]>(`/attendance?date=${date}`).then(setRows).catch((e) => setError(e.message));
  }, [date]);
  useEffect(load, [load]);

  async function cancel(id: string) {
    try {
      await api.post(`/attendance/${id}/cancel`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't cancel.");
    }
  }

  return (
    <div className="p-6">
      <h1 className="font-display text-2xl font-bold text-ink">Bookings &amp; attendance</h1>
      <p className="mt-1 text-sm text-ink/60">Everything scheduled or attended on a day. Check-in and check-out happen on Today&apos;s roster.</p>
      <div className="mt-4">
        <label className="label">Day</label>
        <input type="date" className="field max-w-xs" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      {error && <p className="mt-3 rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p>}

      <div className="mt-4 space-y-2">
        {rows.map((a) => (
          <div key={a.id} className="card flex items-center justify-between">
            <div>
              <p className="font-semibold text-ink">{a.child?.name}{a.isDropIn ? " · drop-in" : ""}</p>
              <p className="text-sm text-ink/60">
                {a.scheduledStart ? `Booked ${fmtTime(a.scheduledStart)}–${fmtTime(a.scheduledEnd)}` : "Walk-in"}
                {a.checkInAt ? ` · in ${fmtTime(a.checkInAt)}` : ""}
                {a.checkOutAt ? ` · out ${fmtTime(a.checkOutAt)}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {a.feeCents > 0 && <span className="font-mono text-sm text-ink/70">{money(a.feeCents)}{a.paymentStatus === "paid" ? " ✓" : a.paymentStatus === "waived" ? " (waived)" : ""}</span>}
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[a.status]}`}>{a.status.replace("_", " ")}</span>
              {a.status === "booked" && <button className="text-xs font-medium text-coral hover:underline" onClick={() => cancel(a.id)}>Cancel</button>}
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="rounded-card border border-dashed border-line p-8 text-center text-sm text-ink/50">Nothing on this day.</p>}
      </div>
    </div>
  );
}

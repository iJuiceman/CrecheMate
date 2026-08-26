"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

interface DayCount { date: string; total: number; booked: number; dropIn: number; pending: number }
interface CalResp { capacity: number; days: DayCount[] }

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const isoLocal = (d: Date) => d.toLocaleDateString("en-CA");
const todayIso = () => new Date().toLocaleDateString("en-CA");

// Teal heat fill scaled against a sensible reference (busiest day, capacity, or a
// floor of 4) so a quiet month isn't painted dark.
function heat(total: number, scale: number): { bg: string; fg: string } {
  if (total <= 0) return { bg: "transparent", fg: "#1f2933" };
  const ratio = Math.min(1, total / scale);
  const alpha = ratio <= 0.25 ? 0.18 : ratio <= 0.5 ? 0.4 : ratio <= 0.75 ? 0.64 : 0.88;
  return { bg: `rgba(13,148,136,${alpha})`, fg: alpha >= 0.6 ? "#ffffff" : "#0f766e" };
}

export default function BookingCalendar({ selected, onSelect, refreshKey = 0 }: { selected: string; onSelect: (iso: string) => void; refreshKey?: number }) {
  const init = selected ? new Date(`${selected}T00:00:00`) : new Date();
  const [view, setView] = useState({ y: init.getFullYear(), m: init.getMonth() });
  const [data, setData] = useState<CalResp | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 6-week grid (42 cells) starting on the Monday on/before the 1st.
  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1);
    const offset = (first.getDay() + 6) % 7; // Monday = 0
    const start = new Date(view.y, view.m, 1 - offset);
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [view]);

  const load = useCallback(() => {
    setError(null);
    api.get<CalResp>(`/attendance/calendar?from=${isoLocal(cells[0])}&to=${isoLocal(cells[41])}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load the calendar."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, refreshKey]);
  useEffect(load, [load]);

  const counts = useMemo(() => {
    const m = new Map<string, DayCount>();
    for (const d of data?.days ?? []) m.set(d.date, d);
    return m;
  }, [data]);

  const capacity = data?.capacity ?? 0;
  const maxTotal = Math.max(0, ...(data?.days ?? []).map((d) => d.total));
  const scale = Math.max(maxTotal, capacity, 4);
  const monthPrefix = `${view.y}-${String(view.m + 1).padStart(2, "0")}`;
  const t = todayIso();
  const upcoming = (data?.days ?? [])
    .filter((d) => d.date >= t && d.date.startsWith(monthPrefix))
    .reduce((s, d) => s + d.total, 0);
  const monthTotal = (data?.days ?? []).filter((d) => d.date.startsWith(monthPrefix)).reduce((s, d) => s + d.total, 0);

  const shift = (delta: number) => setView((v) => {
    const d = new Date(v.y, v.m + delta, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  function pick(cell: Date) {
    if (cell.getMonth() !== view.m || cell.getFullYear() !== view.y) setView({ y: cell.getFullYear(), m: cell.getMonth() });
    onSelect(isoLocal(cell));
  }
  function goToday() {
    const now = new Date();
    setView({ y: now.getFullYear(), m: now.getMonth() });
    onSelect(todayIso());
  }

  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button className="grid h-8 w-8 place-items-center rounded-lg border border-line text-ink/70 hover:bg-sand" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
          <h2 className="min-w-[9.5rem] text-center font-display text-lg font-bold text-ink">{MONTHS[view.m]} {view.y}</h2>
          <button className="grid h-8 w-8 place-items-center rounded-lg border border-line text-ink/70 hover:bg-sand" onClick={() => shift(1)} aria-label="Next month">›</button>
          <button className="ml-1 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink/70 hover:bg-sand" onClick={goToday}>Today</button>
        </div>
        <p className="text-sm text-ink/60">
          <span className="font-semibold text-teal-dark">{upcoming}</span> upcoming · {monthTotal} this month
        </p>
      </div>

      {error && <p className="mb-2 rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p>}

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => <div key={w} className="pb-1 text-center text-xs font-semibold uppercase tracking-wide text-ink/40">{w}</div>)}
        {cells.map((cell) => {
          const iso = isoLocal(cell);
          const inMonth = cell.getMonth() === view.m;
          const dc = counts.get(iso);
          const total = dc?.total ?? 0;
          const { bg, fg } = heat(total, scale);
          const isToday = iso === t;
          const isSelected = iso === selected;
          return (
            <button
              key={iso}
              onClick={() => pick(cell)}
              title={dc ? `${total} booking${total === 1 ? "" : "s"}${dc.pending ? ` · ${dc.pending} pending` : ""}` : "No bookings"}
              className={`relative flex aspect-square flex-col rounded-lg border p-1 text-left transition-colors ${
                isSelected ? "border-teal ring-2 ring-teal" : isToday ? "border-teal/60" : "border-line"
              } ${inMonth ? "" : "opacity-40"} hover:border-teal`}
              style={{ backgroundColor: bg }}
            >
              <span className={`text-xs font-semibold ${isToday ? "text-teal-dark" : ""}`} style={{ color: total > 0 ? fg : undefined }}>{cell.getDate()}</span>
              {total > 0 && (
                <span className="mt-auto text-center text-base font-bold leading-none" style={{ color: fg }}>{total}</span>
              )}
              {dc?.pending ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-coral" title={`${dc.pending} pending request(s)`} /> : null}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink/50">
        <span className="flex items-center gap-1">Fewer
          {[0.18, 0.4, 0.64, 0.88].map((a) => <span key={a} className="inline-block h-3 w-4 rounded" style={{ backgroundColor: `rgba(13,148,136,${a})` }} />)}
          More
        </span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-coral" /> pending request</span>
        <span>Numbers = confirmed bookings that day. Click a day to see them below.</span>
      </div>
    </div>
  );
}

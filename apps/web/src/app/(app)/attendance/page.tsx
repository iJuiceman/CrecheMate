"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Attendance, BookingRequestRow, Guardian, Settings, money } from "@/lib/types";
import CourtInput from "@/components/CourtInput";
import BookingCalendar from "@/components/BookingCalendar";

function fmtTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true }) : "—";
}
function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
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
  const [requests, setRequests] = useState<BookingRequestRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [takeBooking, setTakeBooking] = useState(false);
  const [calRefresh, setCalRefresh] = useState(0);
  const bumpCal = () => setCalRefresh((x) => x + 1);
  const [courts, setCourts] = useState<string[]>([]);
  const [policy, setPolicy] = useState({ hours: 24, percent: 50 });

  const loadDay = useCallback(() => {
    api.get<Attendance[]>(`/attendance?date=${date}`).then(setRows).catch((e) => setError(e.message));
  }, [date]);
  const loadRequests = useCallback(() => {
    api.get<BookingRequestRow[]>("/bookings/requests").then(setRequests).catch(() => setRequests([]));
  }, []);
  useEffect(loadDay, [loadDay]);
  useEffect(loadRequests, [loadRequests]);
  useEffect(() => {
    api.get<Settings>("/settings").then((s) => {
      setCourts(s.courts ?? []);
      setPolicy({ hours: s.lateCancelWindowHours ?? 24, percent: s.lateCancelRefundPercent ?? 50 });
    }).catch(() => {});
  }, []);

  async function cancel(id: string) {
    const a = rows.find((r) => r.id === id);
    const paid = !!a && a.paymentStatus === "paid" && a.feeCents > 0;
    const msg = paid
      ? `Cancel this booking? Refund policy: 100% if more than ${policy.hours}h before the start, otherwise ${policy.percent}%. The refund is issued automatically.`
      : "Cancel this booking?";
    if (!confirm(msg)) return;
    try {
      const res = await api.post<{ refundedCents?: number; refundPercent?: number }>(`/attendance/${id}/cancel`);
      setError(null);
      setNotice(res.refundedCents ? `Booking cancelled — ${money(res.refundedCents)} refunded (${res.refundPercent}%).` : "Booking cancelled.");
      loadDay(); bumpCal();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't cancel.");
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Bookings &amp; attendance</h1>
          <p className="mt-1 text-sm text-ink/60">Confirm online requests, take phone bookings, and see any day&apos;s schedule.</p>
        </div>
        <button className="btn" onClick={() => setTakeBooking(true)}>+ Take a booking</button>
      </div>

      {error && <p className="mt-3 rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p>}
      {notice && <p className="mt-3 rounded-lg bg-teal-light px-3 py-2 text-sm text-teal-dark">{notice}</p>}

      {/* Online booking requests awaiting confirmation */}
      {requests.length > 0 && (
        <section className="mt-5">
          <h2 className="mb-2 font-display text-lg font-bold text-ink">
            Online booking requests <span className="ml-1 rounded-full bg-coral px-2 py-0.5 text-xs font-semibold text-white">{requests.length}</span>
          </h2>
          <div className="space-y-3">
            {requests.map((r) => (
              <RequestCard key={r.id} req={r} onDone={(msg) => { setNotice(msg); setError(null); loadRequests(); loadDay(); bumpCal(); }} onError={setError} />
            ))}
          </div>
        </section>
      )}

      {/* Bookings calendar — colour-coded by how busy each day is; click a day
          to load its confirmed bookings below. */}
      <section className="mt-6">
        <BookingCalendar selected={date} refreshKey={calRefresh} onSelect={(iso) => { setDate(iso); document.getElementById("day-schedule")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} />
      </section>

      {/* Day schedule */}
      <div id="day-schedule" className="mt-6 flex flex-wrap items-end justify-between gap-2">
        <div>
          <label className="label">Bookings for</label>
          <input type="date" className="field max-w-xs" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <p className="text-sm text-ink/60">{new Date(`${date}T00:00:00`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {rows.filter((r) => r.status !== "cancelled" && r.status !== "no_show").length} confirmed</p>
      </div>
      <div className="mt-3 space-y-2">
        {rows.map((a) => (
          <div key={a.id} className="card flex items-center justify-between">
            <div>
              <p className="font-semibold text-ink">{a.child?.name}{a.isDropIn ? " · drop-in" : ""}</p>
              <p className="text-sm text-ink/60">
                {a.scheduledStart ? `Booked ${fmtTime(a.scheduledStart)}–${fmtTime(a.scheduledEnd)}` : "Walk-in"}
                {a.checkInAt ? ` · in ${fmtTime(a.checkInAt)}` : ""}
                {a.checkOutAt ? ` · out ${fmtTime(a.checkOutAt)}` : ""}
                {a.court ? ` · 📍 ${a.court}` : ""}
                {a.courtBookingName ? ` (court: ${a.courtBookingName})` : ""}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {a.feeCents > 0 && <span className="font-mono text-sm text-ink/70">{money(a.feeCents)}{a.paymentStatus === "paid" ? " ✓" : a.paymentStatus === "waived" ? " (waived)" : ""}{a.refundedCents > 0 ? ` · ${money(a.refundedCents)} refunded` : ""}</span>}
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[a.status]}`}>{a.status.replace("_", " ")}</span>
              {a.status === "booked" && <button className="text-xs font-medium text-coral hover:underline" onClick={() => cancel(a.id)}>Cancel</button>}
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="rounded-card border border-dashed border-line p-8 text-center text-sm text-ink/50">Nothing on this day.</p>}
      </div>

      {takeBooking && <TakeBookingModal courts={courts} onClose={() => setTakeBooking(false)} onBooked={(name) => { setTakeBooking(false); setNotice(`Booked ${name}.`); loadDay(); bumpCal(); }} onError={setError} />}
    </div>
  );
}

function RequestCard({ req, onDone, onError }: { req: BookingRequestRow; onDone: (msg: string) => void; onError: (s: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [match, setMatch] = useState(false);

  async function act(fn: () => Promise<{ ok?: boolean; refunded?: boolean }>, msg: string) {
    setBusy(true);
    try { await fn(); onDone(msg); }
    catch (e) { onError(e instanceof Error ? e.message : "That action failed."); setBusy(false); }
  }

  const confirmFor = (childId: string) => act(() => api.post(`/bookings/requests/${req.id}/confirm`, { childId }), `Booking approved — ${money(req.feeCents)} charged for ${req.childName}.`);
  const confirmNew = () => act(() => api.post(`/bookings/requests/${req.id}/confirm`, { createNewFamily: true }), `New family created and booking approved — ${money(req.feeCents)} charged for ${req.childName}.`);
  const decline = () => {
    if (!confirm(`Decline this request? The ${money(req.feeCents)} hold on ${req.parentName}'s card is released — they are not charged.`)) return;
    return act(() => api.post(`/bookings/requests/${req.id}/decline`, {}), `Request declined; card hold released (${req.parentName} not charged).`);
  };

  return (
    <div className="card border-l-4 border-l-teal">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-ink">{req.childName} <span className="text-sm font-normal text-ink/50">{req.childAge != null ? `· age ${req.childAge}` : ""}</span></p>
          <p className="text-sm text-ink/70">{fmtDay(req.requestedStart)} · {fmtTime(req.requestedStart)}–{fmtTime(req.requestedEnd)}</p>
          {req.court && <p className="mt-1 text-sm text-ink/70">📍 {req.court}{req.courtBookingName ? ` · court booked under ${req.courtBookingName}` : ""}</p>}
          <p className="mt-1 text-sm text-ink/60">Parent: {req.parentName} · {req.parentPhone}{req.parentEmail ? ` · ${req.parentEmail}` : ""}</p>
          {req.notes && <p className="mt-1 text-sm text-ink/60">Note: {req.notes}</p>}
        </div>
        <span className="rounded-full bg-teal-light px-2 py-0.5 text-xs font-semibold text-teal-dark">{money(req.feeCents)} card held</span>
      </div>

      {req.suggestedMatch && (
        <div className="mt-3 rounded-lg bg-sand px-3 py-2 text-sm">
          <span className="text-ink/70">Likely existing family: <b>{req.suggestedMatch.childName}</b> — {req.suggestedMatch.guardianName}</span>
          {req.suggestedMatch.phoneMatches && <span className="ml-1 rounded-full bg-teal-light px-1.5 py-0.5 text-xs font-semibold text-teal-dark">phone matches</span>}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {req.suggestedMatch && (
          <button className="btn px-3 py-1.5 text-xs" disabled={busy} onClick={() => confirmFor(req.suggestedMatch!.childId)}>
            Approve &amp; charge for {req.suggestedMatch.childName}
          </button>
        )}
        <button className="btn-secondary px-3 py-1.5 text-xs" disabled={busy} onClick={() => setMatch(true)}>Match to a family…</button>
        <button className="btn-secondary px-3 py-1.5 text-xs" disabled={busy} onClick={confirmNew}>Approve as new family</button>
        <button className="px-3 py-1.5 text-xs font-medium text-coral hover:underline" disabled={busy} onClick={decline}>Decline (release hold)</button>
      </div>

      {match && <MatchModal req={req} onClose={() => setMatch(false)} onPick={(childId) => { setMatch(false); confirmFor(childId); }} />}
    </div>
  );
}

function MatchModal({ req, onClose, onPick }: { req: BookingRequestRow; onClose: () => void; onPick: (childId: string) => void }) {
  const [q, setQ] = useState(`${req.childFirstName} ${req.childLastName}`);
  const [results, setResults] = useState<Guardian[]>([]);
  useEffect(() => {
    const t = setTimeout(() => {
      api.get<Guardian[]>(`/families${q.trim() ? `?query=${encodeURIComponent(q.trim())}` : ""}`).then(setResults).catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-card bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-lg font-bold text-ink">Match “{req.childName}” to a family</h2>
        <input autoFocus className="field mt-3" placeholder="Search by child or parent name / phone…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
          {results.flatMap((g) => g.children.map((c) => (
            <button key={c.id} className="flex w-full items-center justify-between rounded-lg border border-line px-3 py-2 text-left hover:bg-sand" onClick={() => onPick(c.id)}>
              <span>
                <span className="text-sm font-medium text-ink">{c.firstName} {c.lastName}</span>
                <span className="block text-xs text-ink/50">{g.firstName} {g.lastName} · {g.phone}</span>
              </span>
              <span className="text-xs font-semibold text-teal">Confirm →</span>
            </button>
          )))}
          {results.length === 0 && <p className="py-6 text-center text-sm text-ink/40">No matches. Use “Confirm as new family” instead.</p>}
        </div>
        <button className="btn-secondary mt-4 w-full" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

function TakeBookingModal({ courts, onClose, onBooked, onError }: { courts: string[]; onClose: () => void; onBooked: (name: string) => void; onError: (s: string) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Guardian[]>([]);
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("12:00");
  const [court, setCourt] = useState("");
  const [courtName, setCourtName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (picked) return;
    const t = setTimeout(() => {
      api.get<Guardian[]>(`/families${q.trim() ? `?query=${encodeURIComponent(q.trim())}` : ""}`).then(setResults).catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q, picked]);

  async function book() {
    if (!picked) return;
    if (!court.trim()) { onError("A court booking is required — pick the court."); return; }
    setBusy(true);
    try {
      await api.post("/attendance/book", {
        childId: picked.id,
        startAt: new Date(`${date}T${start}:00`).toISOString(),
        endAt: new Date(`${date}T${end}:00`).toISOString(),
        court: court.trim(),
        courtBookingName: courtName.trim() || undefined,
      });
      onBooked(picked.name);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn't book.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-card bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-lg font-bold text-ink">Take a booking</h2>
        {!picked ? (
          <>
            <p className="mt-1 text-sm text-ink/55">Find the child, then pick a date and time.</p>
            <input autoFocus className="field mt-3" placeholder="Search by child or parent name / phone…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
              {results.flatMap((g) => g.children.map((c) => (
                <button key={c.id} className="flex w-full items-center justify-between rounded-lg border border-line px-3 py-2 text-left hover:bg-sand" onClick={() => setPicked({ id: c.id, name: `${c.firstName} ${c.lastName}` })}>
                  <span>
                    <span className="text-sm font-medium text-ink">{c.firstName} {c.lastName}</span>
                    <span className="block text-xs text-ink/50">{g.firstName} {g.lastName} · {g.phone}</span>
                  </span>
                  <span className="text-xs font-semibold text-teal">Select →</span>
                </button>
              )))}
              {results.length === 0 && <p className="py-6 text-center text-sm text-ink/40">No matches. Register the family under “Families &amp; children” first.</p>}
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 rounded-lg bg-sand px-3 py-2 text-sm text-ink/80">Booking for <b>{picked.name}</b> <button className="ml-2 text-teal hover:underline" onClick={() => setPicked(null)}>change</button></p>
            <div className="mt-3 space-y-3">
              <div><label className="label">Date</label><input type="date" className="field" min={new Date().toLocaleDateString("en-CA")} value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">From</label><input type="time" className="field" step={1800} value={start} onChange={(e) => setStart(e.target.value)} /></div>
                <div><label className="label">Until</label><input type="time" className="field" step={1800} value={end} onChange={(e) => setEnd(e.target.value)} /></div>
              </div>
              <div><label className="label">Court booking (required — same time as above)</label><CourtInput value={court} onChange={setCourt} courts={courts} /></div>
              <div><label className="label">Court booked under (if not the parent)</label><input className="field" placeholder="Name on the court booking" value={courtName} onChange={(e) => setCourtName(e.target.value)} /></div>
              <p className="text-xs text-ink/50">A creche booking must be attached to a court booking, for the same duration. The fee is taken at check-out, billed to the nearest ¼ hour.</p>
            </div>
            <button className="btn mt-4 w-full" disabled={busy || !court.trim()} onClick={book}>{busy ? "Booking…" : "Confirm booking"}</button>
          </>
        )}
        <button className="btn-secondary mt-3 w-full" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

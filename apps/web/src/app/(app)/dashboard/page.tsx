"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Attendance, Dashboard, Guardian, Roster, StaffRosterToday, money } from "@/lib/types";
import StripeCardModal from "@/components/StripeCardModal";
import CourtInput from "@/components/CourtInput";
import WaiverSignModal from "@/components/WaiverSignModal";

interface PaymentIntentResponse {
  id: string;
  clientSecret: string;
  testMode: boolean;
  publishableKey: string | null;
}

function timeSince(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}
function fmtTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true }) : "—";
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [roster, setRoster] = useState<Roster | null>(null);
  const [stats, setStats] = useState<Dashboard | null>(null);
  const [staffToday, setStaffToday] = useState<StaffRosterToday | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showCheckIn, setShowCheckIn] = useState(false);

  const load = useCallback(() => {
    Promise.all([api.get<Roster>("/attendance/roster"), api.get<Dashboard>("/attendance/dashboard")])
      .then(([r, s]) => { setRoster(r); setStats(s); setError(null); })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load the roster."));
    api.get<StaffRosterToday>("/staff-roster/today").then(setStaffToday).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  async function act(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That action failed.");
    } finally {
      setBusy(null);
    }
  }

  const rate = roster?.hourlyRateCents ?? 0;

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink">Today&apos;s roster</h1>
        <button className="btn" onClick={() => setShowCheckIn(true)}>+ Check a child in</button>
      </div>

      {error && <p className="mb-4 rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p>}

      {/* Who is in charge of the creche right now (from the staff roster). */}
      {staffToday && (
        <div className={`mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card px-4 py-3 ${staffToday.onNow.length ? "bg-teal-light/60" : "bg-coral/10"}`}>
          {staffToday.onNow.length ? (
            <>
              <span className="text-sm font-semibold text-teal-dark">🎖 In charge: {staffToday.onNow.map((s) => s.user?.name ?? "—").join(" · ")}</span>
              <span className="text-xs text-ink/50">until {fmtTime(staffToday.onNow[0].endAt)}</span>
            </>
          ) : (
            <span className="text-sm font-semibold text-coral">No one is rostered in the creche right now</span>
          )}
          {staffToday.today.length > 0 && (
            <span className="text-xs text-ink/50">
              Today: {staffToday.today.map((s) => `${s.user?.name ?? "—"} ${fmtTime(s.startAt)}–${fmtTime(s.endAt)}`).join(" · ")}
            </span>
          )}
          <Link href="/roster" className="ml-auto text-xs font-medium text-teal hover:underline">Roster →</Link>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="In care now" value={`${stats.inCareCount} / ${stats.capacity}`} sub={`${stats.spacesFree} spaces free`} warn={stats.spacesFree === 0} />
          <Stat label="Expected today" value={String(stats.expectedToday)} sub="booked, not arrived" />
          <Stat label="Finished today" value={String(stats.finishedToday)} sub="collected" />
          <Stat label="Outstanding" value={money(stats.outstandingCents)} sub={`${stats.outstandingCount} unpaid`} warn={stats.outstandingCount > 0} />
        </div>
      )}

      {/* Day timeline — every child expected/here/finished today at a glance. */}
      {roster && (roster.inCare.length + roster.expected.length + roster.finished.length) > 0 && (
        <Section title="Today at a glance" count={roster.inCare.length + roster.expected.length + roster.finished.length}>
          <TodayTimeline roster={roster} />
        </Section>
      )}

      {/* In care now */}
      <Section title="In care now" count={roster?.inCare.length ?? 0}>
        {roster?.inCare.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {roster.inCare.map((a) => (
              <InCareCard key={a.id} a={a} courts={roster.courts} rate={rate} busy={busy} act={act} isAdmin={user?.role === "admin"} />
            ))}
          </div>
        ) : (
          <Empty>No children are in care right now.</Empty>
        )}
      </Section>

      {/* Expected */}
      {roster && roster.expected.length > 0 && (
        <Section title="Expected today" count={roster.expected.length}>
          <div className="grid gap-3 md:grid-cols-2">
            {roster.expected.map((a) => (
              <ExpectedCard key={a.id} a={a} courts={roster.courts} waiverVersion={roster.waiverVersion} busy={busy} act={act} />
            ))}
          </div>
        </Section>
      )}

      {/* Finished / payment */}
      {roster && roster.finished.length > 0 && (
        <Section title="Finished today" count={roster.finished.length}>
          <div className="grid gap-3 md:grid-cols-2">
            {roster.finished.map((a) => (
              <div key={a.id} className="card">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-ink">{a.child?.name}</span>
                  <span className="text-sm text-ink/50">{fmtTime(a.checkInAt)}–{fmtTime(a.checkOutAt)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-mono text-sm text-ink">{money(a.feeCents)}</span>
                  <PayBadge a={a} />
                </div>
                {a.paymentStatus === "unpaid" && a.feeCents > 0 && (
                  <PaymentRow attendanceId={a.id} feeCents={a.feeCents} busyKey={busy} onDone={load} onBusy={setBusy} />
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {showCheckIn && <CheckInModal courts={roster?.courts ?? []} waiverVersion={roster?.waiverVersion ?? 1} onClose={() => setShowCheckIn(false)} onDone={() => { setShowCheckIn(false); load(); }} />}
    </div>
  );
}

function estFee(checkInAt: string | null, rate: number): number {
  if (!checkInAt) return 0;
  const hours = (Date.now() - new Date(checkInAt).getTime()) / 3_600_000;
  return Math.round(hours * rate);
}

type Act = (key: string, fn: () => Promise<unknown>) => Promise<void>;

function InCareCard({ a, courts, rate, busy, act, isAdmin }: { a: Attendance; courts: string[]; rate: number; busy: string | null; act: Act; isAdmin: boolean }) {
  const [editCourt, setEditCourt] = useState(false);
  const [court, setCourt] = useState(a.court ?? "");
  const disabled = busy === a.id;
  // A check-in from a previous day is almost always a forgotten check-out —
  // and it consumes a capacity slot until it's corrected.
  const staleCheckIn = !!a.checkInAt && new Date(a.checkInAt).toDateString() !== new Date().toDateString();

  async function saveCourt() {
    await act(a.id, () => api.post(`/attendance/${a.id}/court`, { court: court.trim() || undefined }));
    setEditCourt(false);
  }

  return (
    <div className="card">
      <ChildHeader a={a} />
      {staleCheckIn && (
        <p className="mt-2 rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
          ⚠ Checked in on a previous day — probably a missed check-out. It still counts against capacity.
          {isAdmin && (
            <button className="ml-2 font-semibold underline" disabled={disabled} onClick={() => act(a.id, () => api.post(`/attendance/${a.id}/force-checkout`, {}))}>
              Force check-out
            </button>
          )}
        </p>
      )}
      {/* Court — where to find the parent. Prominent because it matters most. */}
      <div className="mt-2 rounded-lg bg-teal-light/50 px-3 py-2">
        {editCourt ? (
          <div className="flex items-center gap-2">
            <CourtInput value={court} onChange={setCourt} courts={courts} className="field py-1.5 text-sm" autoFocus />
            <button className="btn px-3 py-1.5 text-xs" disabled={disabled} onClick={saveCourt}>Save</button>
            <button className="text-xs text-ink/50 hover:underline" onClick={() => { setCourt(a.court ?? ""); setEditCourt(false); }}>Cancel</button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-teal-dark">
              📍 {a.court ? `On ${a.court}` : <span className="font-normal text-ink/50">No court set</span>}
              {a.courtBookingName ? <span className="font-normal text-ink/50"> · court booked under {a.courtBookingName}</span> : null}
            </span>
            <button className="text-xs font-medium text-teal hover:underline" onClick={() => setEditCourt(true)}>{a.court ? "Change" : "Set court"}</button>
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between text-sm text-ink/60">
        <span>In {a.checkInAt ? timeSince(a.checkInAt) : "—"} · since {fmtTime(a.checkInAt)}</span>
        <span className="tabular-nums">~{money(estFee(a.checkInAt, rate))}</span>
      </div>
      <button
        className="btn mt-3 w-full"
        disabled={disabled}
        onClick={() =>
          act(a.id, async () => {
            const r = await api.post<{ overstayCents?: number }>(`/attendance/${a.id}/check-out`, {});
            // A prepaid child who stayed past their booked window: the settled
            // fee is frozen server-side — tell the desk what to collect.
            if (r.overstayCents && r.overstayCents > 0) {
              window.alert(`Heads up: time in care ran past the prepaid window — collect ${money(r.overstayCents)} at the desk.`);
            }
          })
        }
      >
        {disabled ? "…" : "Check out"}
      </button>
    </div>
  );
}

function ExpectedCard({ a, courts, waiverVersion, busy, act }: { a: Attendance; courts: string[]; waiverVersion: number; busy: string | null; act: Act }) {
  const [court, setCourt] = useState(a.court ?? "");
  const [signWaiver, setSignWaiver] = useState(false);
  const disabled = busy === a.id;
  // Waivers are mandatory: a stale/missing acceptance means the parent signs
  // on screen before this check-in goes through.
  const waiverOk = a.child?.guardian?.waiverVersion === waiverVersion;

  function checkIn(waiverSignature?: string) {
    return act(a.id, () => api.post(`/attendance/${a.id}/check-in`, { court: court.trim() || undefined, waiverSignature }));
  }

  return (
    <div className="card">
      <ChildHeader a={a} />
      <p className="mt-2 text-sm text-ink/60">Booked {fmtTime(a.scheduledStart)} – {fmtTime(a.scheduledEnd)}</p>
      {!waiverOk && (
        <p className="mt-2 rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">✍ Waiver signature needed at check-in</p>
      )}
      <div className="mt-2">
        <label className="label">Court (where the parent will be)</label>
        <CourtInput value={court} onChange={setCourt} courts={courts} className="field py-1.5 text-sm" />
      </div>
      <div className="mt-3 flex gap-2">
        <button className="btn flex-1" disabled={disabled} onClick={() => (waiverOk ? checkIn() : setSignWaiver(true))}>Check in</button>
        <button className="btn-secondary" disabled={disabled} onClick={() => act(a.id, () => api.post(`/attendance/${a.id}/cancel`, {}))}>Cancel</button>
        {a.scheduledEnd && new Date(a.scheduledEnd) < new Date() && (
          <button className="btn-secondary" disabled={disabled} title="The booked window has passed and the child never arrived" onClick={() => act(a.id, () => api.post(`/attendance/${a.id}/no-show`, {}))}>No-show</button>
        )}
      </div>
      {signWaiver && (
        <WaiverSignModal
          parentName={a.child?.guardian?.name ?? "The parent"}
          onClose={() => setSignWaiver(false)}
          onSigned={(sig) => { setSignWaiver(false); checkIn(sig); }}
        />
      )}
    </div>
  );
}

/** Horizontal day timeline: one bar per child, open→close axis, "now" line.
 * Booked = outline, in care = solid teal, finished = grey. */
function TodayTimeline({ roster }: { roster: Roster }) {
  const [openH, openM] = roster.openTime.split(":").map(Number);
  const [closeH, closeM] = roster.closeTime.split(":").map(Number);
  const dayStart = new Date(); dayStart.setHours(openH || 7, openM || 0, 0, 0);
  const dayEnd = new Date(); dayEnd.setHours(closeH || 18, closeM || 0, 0, 0);
  const span = Math.max(1, dayEnd.getTime() - dayStart.getTime());
  const pct = (iso: string | null, fallback: Date) => {
    const t = iso ? new Date(iso).getTime() : fallback.getTime();
    return Math.min(100, Math.max(0, ((t - dayStart.getTime()) / span) * 100));
  };
  const now = new Date();
  const nowPct = ((now.getTime() - dayStart.getTime()) / span) * 100;

  const rows = [...roster.inCare, ...roster.expected, ...roster.finished]
    .map((a) => {
      const from = a.checkInAt ?? a.scheduledStart;
      const to = a.checkOutAt ?? a.scheduledEnd;
      return { a, left: pct(from, dayStart), right: pct(to, a.status === "checked_in" ? now : dayEnd) };
    })
    .sort((x, y) => x.left - y.left);

  const hours: number[] = [];
  for (let h = Math.ceil(openH + (openM ? 1 : 0)); h <= closeH; h++) hours.push(h);
  const hourLabel = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? "am" : "pm"}`;

  return (
    <div className="card overflow-x-auto">
      <div className="relative min-w-[560px]">
        {/* Hour ruler */}
        <div className="relative mb-1 h-4 text-[10px] text-ink/40">
          {hours.map((h) => {
            const p = ((new Date(dayStart).setHours(h, 0, 0, 0) - dayStart.getTime()) / span) * 100;
            return p >= 0 && p <= 100 ? <span key={h} className="absolute -translate-x-1/2" style={{ left: `${p}%` }}>{hourLabel(h)}</span> : null;
          })}
        </div>
        <div className="relative space-y-1">
          {/* Hour gridlines + now line */}
          <div className="pointer-events-none absolute inset-0">
            {hours.map((h) => {
              const p = ((new Date(dayStart).setHours(h, 0, 0, 0) - dayStart.getTime()) / span) * 100;
              return p >= 0 && p <= 100 ? <div key={h} className="absolute bottom-0 top-0 border-l border-line/60" style={{ left: `${p}%` }} /> : null;
            })}
            {nowPct >= 0 && nowPct <= 100 && <div className="absolute bottom-0 top-0 z-10 border-l-2 border-coral" style={{ left: `${nowPct}%` }} />}
          </div>
          {rows.map(({ a, left, right }) => {
            const w = Math.max(3, right - left);
            const styleByStatus =
              a.status === "checked_in" ? "bg-teal text-white"
              : a.status === "booked" ? "border border-teal bg-teal-light/40 text-teal-dark"
              : "bg-line text-ink/50";
            return (
              <div key={a.id} className="relative h-6">
                <div
                  className={`absolute flex h-6 items-center gap-1 overflow-hidden whitespace-nowrap rounded-md px-2 text-[11px] font-medium ${styleByStatus}`}
                  style={{ left: `${left}%`, width: `${w}%`, minWidth: "3.5rem" }}
                  title={`${a.child?.name ?? ""} · ${fmtTime(a.checkInAt ?? a.scheduledStart)}–${fmtTime(a.checkOutAt ?? a.scheduledEnd)}${a.court ? ` · ${a.court}` : ""}`}
                >
                  {a.child?.name}
                  {a.status === "checked_in" && a.court ? <span className="opacity-75">· {a.court}</span> : null}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-ink/40">
          <span className="mr-3"><span className="mr-1 inline-block h-2 w-4 rounded-sm border border-teal bg-teal-light/40 align-middle" />booked</span>
          <span className="mr-3"><span className="mr-1 inline-block h-2 w-4 rounded-sm bg-teal align-middle" />in care</span>
          <span className="mr-3"><span className="mr-1 inline-block h-2 w-4 rounded-sm bg-line align-middle" />finished</span>
          <span><span className="mr-1 inline-block h-2 w-0.5 bg-coral align-middle" />now</span>
        </p>
      </div>
    </div>
  );
}

function ChildHeader({ a }: { a: Attendance }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="font-semibold text-ink">{a.child?.name}</span>
        {a.child?.age != null && <span className="text-xs text-ink/50">age {a.child.age}</span>}
        {a.isDropIn && <span className="rounded-full bg-teal-light px-2 py-0.5 text-[10px] font-semibold text-teal-dark">drop-in</span>}
      </div>
      {a.child?.medicalNotes && (
        <p className="mt-1 rounded-md bg-coral/10 px-2 py-1 text-xs font-medium text-coral">⚕ {a.child.medicalNotes}</p>
      )}
      {/* Parents ARE the emergency contacts; extra contacts follow as "Also". */}
      <p className="mt-1 text-xs text-ink/60">
        Parent: {a.child?.guardian?.name} · {a.child?.guardian?.phone}
        {a.child?.guardian?.secondName ? ` · ${a.child.guardian.secondName}${a.child.guardian.secondPhone ? ` ${a.child.guardian.secondPhone}` : ""}` : ""}
      </p>
      {a.child?.emergencyContacts?.length ? (
        <p className="mt-0.5 text-xs text-ink/50">
          Also: {a.child.emergencyContacts.map((e) => `${e.name}${e.relationship ? ` (${e.relationship})` : ""} ${e.phone}${e.canPickup ? "" : " (no pickup)"}`).join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

function PayBadge({ a }: { a: Attendance }) {
  if (a.paymentStatus === "paid") return <span className="rounded-full bg-teal-light px-2 py-0.5 text-xs font-semibold text-teal-dark">Paid{a.paymentMethod ? ` · ${a.paymentMethod}` : ""}</span>;
  if (a.paymentStatus === "waived") return <span className="rounded-full bg-line px-2 py-0.5 text-xs font-semibold text-ink/60">Waived</span>;
  return <span className="rounded-full bg-coral/10 px-2 py-0.5 text-xs font-semibold text-coral">Unpaid</span>;
}

function PaymentRow({ attendanceId, feeCents, busyKey, onDone, onBusy }: { attendanceId: string; feeCents: number; busyKey: string | null; onDone: () => void; onBusy: (k: string | null) => void }) {
  const [err, setErr] = useState<string | null>(null);
  // Set when a real Stripe intent needs the card collected in Elements.
  const [card, setCard] = useState<{ clientSecret: string; publishableKey: string; intentId: string } | null>(null);

  async function record(body: Record<string, unknown>) {
    await api.post(`/attendance/${attendanceId}/payment`, body);
    onDone();
  }

  async function pay(method: "cash" | "card" | "eftpos" | "online") {
    onBusy(attendanceId);
    setErr(null);
    try {
      if (method === "online") {
        const pi = await api.post<PaymentIntentResponse>(`/attendance/${attendanceId}/payment-intent`);
        if (pi.testMode || !pi.publishableKey) {
          // No linked Stripe account — the stub intent is already "succeeded".
          await record({ method: "online", stripePaymentIntentId: pi.id });
        } else {
          // Real account — collect + confirm the card, then record on success.
          setCard({ clientSecret: pi.clientSecret, publishableKey: pi.publishableKey, intentId: pi.id });
          onBusy(null);
          return;
        }
      } else {
        await record({ method });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Payment failed.");
    } finally {
      onBusy(null);
    }
  }

  const disabled = busyKey === attendanceId;
  return (
    <div className="mt-3">
      <p className="label">Take {money(feeCents)}</p>
      <div className="flex flex-wrap gap-2">
        {(["cash", "card", "eftpos", "online"] as const).map((m) => (
          <button key={m} className="btn-secondary px-3 py-1.5 text-xs capitalize" disabled={disabled} onClick={() => pay(m)}>{m === "online" ? "Card (online)" : m}</button>
        ))}
        <button className="rounded-lg px-3 py-1.5 text-xs text-ink/50 hover:text-coral" disabled={disabled} onClick={() => { onBusy(attendanceId); api.post(`/attendance/${attendanceId}/waive`).then(onDone).finally(() => onBusy(null)); }}>Waive</button>
      </div>
      {err && <p className="mt-1 text-xs text-coral">{err}</p>}
      {card && (
        <StripeCardModal
          clientSecret={card.clientSecret}
          publishableKey={card.publishableKey}
          feeCents={feeCents}
          onClose={() => setCard(null)}
          onConfirmed={async () => {
            try {
              await record({ method: "online", stripePaymentIntentId: card.intentId });
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Charged, but recording failed — refresh.");
            } finally {
              setCard(null);
            }
          }}
        />
      )}
    </div>
  );
}

function CheckInModal({ courts, waiverVersion, onClose, onDone }: { courts: string[]; waiverVersion: number; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Guardian[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [court, setCourt] = useState("");
  // Set when the mandatory waiver still needs signing for the chosen child.
  const [signFor, setSignFor] = useState<{ childId: string; parentName: string } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api.get<Guardian[]>(`/families${q.trim() ? `?query=${encodeURIComponent(q.trim())}` : ""}`).then(setResults).catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  async function checkIn(childId: string, waiverSignature?: string) {
    setBusy(childId);
    setErr(null);
    try {
      await api.post("/attendance/drop-in", { childId, court: court.trim() || undefined, waiverSignature });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't check in.");
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-card bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-lg font-bold text-ink">Check a child in</h2>
        <div className="mt-3">
          <label className="label">Court (where the parent will be)</label>
          <CourtInput value={court} onChange={setCourt} courts={courts} />
        </div>
        <input autoFocus className="field mt-3" placeholder="Search by child or parent name / phone…" value={q} onChange={(e) => setQ(e.target.value)} />
        {err && <p className="mt-2 text-sm text-coral">{err}</p>}
        <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
          {results.flatMap((g) => g.children.map((c) => {
            const waiverOk = g.waiverVersion === waiverVersion;
            return (
              <div key={c.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-ink">{c.firstName} {c.lastName}{c.age != null ? ` · age ${c.age}` : ""}</p>
                  <p className="text-xs text-ink/50">{g.firstName} {g.lastName} · {g.phone}</p>
                  {c.medicalNotes && <p className="text-xs text-coral">⚕ {c.medicalNotes}</p>}
                  {!waiverOk && <p className="text-xs font-medium text-amber-700">✍ Waiver signature needed</p>}
                </div>
                <button
                  className="btn px-3 py-1.5 text-xs"
                  disabled={busy === c.id}
                  onClick={() => (waiverOk ? checkIn(c.id) : setSignFor({ childId: c.id, parentName: `${g.firstName} ${g.lastName}` }))}
                >
                  Check in
                </button>
              </div>
            );
          }))}
          {results.length === 0 && <p className="py-6 text-center text-sm text-ink/40">No matches. Add the family under “Families &amp; children”.</p>}
        </div>
        <button className="btn-secondary mt-4 w-full" onClick={onClose}>Close</button>
      </div>
      {signFor && (
        // stopPropagation so a click on the sign-modal backdrop doesn't also
        // fall through to this modal's backdrop and close both.
        <div onClick={(e) => e.stopPropagation()}>
          <WaiverSignModal
            parentName={signFor.parentName}
            onClose={() => setSignFor(null)}
            onSigned={(sig) => { const { childId } = signFor; setSignFor(null); checkIn(childId, sig); }}
          />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="card">
      <p className="label">{label}</p>
      <p className={`font-display text-2xl font-bold ${warn ? "text-coral" : "text-ink"}`}>{value}</p>
      {sub && <p className="text-xs text-ink/50">{sub}</p>}
    </div>
  );
}
function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 font-display text-lg font-bold text-ink">{title} <span className="text-sm font-normal text-ink/40">{count}</span></h2>
      {children}
    </section>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-card border border-dashed border-line p-8 text-center text-sm text-ink/50">{children}</p>;
}

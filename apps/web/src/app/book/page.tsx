"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { isAuPhone } from "@/lib/phone";
import { BookingConfig, money } from "@/lib/types";
import StripeCardModal from "@/components/StripeCardModal";

const field =
  "w-full rounded-xl border border-line bg-white px-4 py-3 text-base text-ink placeholder:text-ink/40 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/40";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MAX_CHILDREN = 8;

interface ChildForm { firstName: string; lastName: string; birthMonth: string; birthYear: string }
const emptyChild = (): ChildForm => ({ firstName: "", lastName: "", birthMonth: "", birthYear: "" });

interface RequestResp {
  requestId: string;
  feeCents: number; // total
  perChildCents: number;
  childCount: number;
  clientSecret: string;
  publishableKey: string | null;
  testMode: boolean;
  paymentIntentId: string;
}

// The court reminder — shown prominently since court is no longer selected here.
function CourtNotice() {
  return (
    <div className="rounded-card border-l-4 border-teal bg-teal-light/70 p-4">
      <p className="font-display text-base font-bold text-teal-dark">🎾 Creche is for players</p>
      <p className="mt-1 text-sm text-ink/80">
        Please confirm you&apos;ve booked a court. <b>Your creche time above must match your court booking.</b>
      </p>
    </div>
  );
}

export default function BookPage() {
  const [cfg, setCfg] = useState<BookingConfig | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [step, setStep] = useState<"session" | "details" | "done">("session");

  // Session
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [quote, setQuote] = useState<{ perChildCents: number; spacesFree: number } | null>(null);

  // Details
  const [parent, setParent] = useState({ firstName: "", lastName: "", phone: "", email: "" });
  const [children, setChildren] = useState<ChildForm[]>([emptyChild()]);
  const [notes, setNotes] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState<RequestResp | null>(null);
  const [confirmedCount, setConfirmedCount] = useState(1);

  useEffect(() => {
    api.get<BookingConfig>("/bookings/config")
      .then((c) => { setCfg(c); setStart(c.openTime); setEnd(c.closeTime); })
      .catch(() => setLoadErr("Couldn't load the booking form. Please try again later."));
  }, []);

  const today = new Date().toLocaleDateString("en-CA");
  const maxDate = useMemo(() => {
    if (!cfg) return undefined;
    const d = new Date();
    d.setDate(d.getDate() + cfg.maxDaysAhead);
    return d.toLocaleDateString("en-CA");
  }, [cfg]);

  const iso = (d: string, t: string) => new Date(`${d}T${t}:00`).toISOString();

  const setChild = (i: number, patch: Partial<ChildForm>) => setChildren(children.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const addChild = () => setChildren((cs) => (cs.length < MAX_CHILDREN ? [...cs, emptyChild()] : cs));
  const removeChild = (i: number) => setChildren((cs) => cs.filter((_, j) => j !== i));

  async function checkAndContinue() {
    if (!date || !start || !end) return setError("Please pick a date and times.");
    setBusy(true); setError(null);
    try {
      const q = await api.post<{ ok: boolean; feeCents: number; spacesFree: number }>("/bookings/quote", { startAt: iso(date, start), endAt: iso(date, end) });
      setQuote({ perChildCents: q.feeCents, spacesFree: q.spacesFree });
      if (q.spacesFree <= 0) { setError("That session is full — please choose a different day or time."); return; }
      setStep("details");
      window.scrollTo(0, 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't check that time.");
    } finally {
      setBusy(false);
    }
  }

  const childValid = (c: ChildForm) => c.firstName.trim() && c.lastName.trim() && c.birthMonth && c.birthYear;
  const detailsValid =
    parent.firstName.trim() && parent.lastName.trim() && isAuPhone(parent.phone) &&
    children.length >= 1 && children.every(childValid);

  const perChild = quote?.perChildCents ?? 0;
  const totalCents = perChild * children.length;
  const overCapacity = quote != null && children.length > quote.spacesFree;

  async function payAndSubmit() {
    if (!detailsValid) return;
    if (overCapacity) return setError(`Only ${quote?.spacesFree} space(s) left for that session — please remove a child or change the time.`);
    setBusy(true); setError(null);
    try {
      const req = await api.post<RequestResp>("/bookings", {
        parent: { firstName: parent.firstName.trim(), lastName: parent.lastName.trim(), phone: parent.phone.trim(), email: parent.email.trim() || undefined },
        children: children.map((c) => ({ firstName: c.firstName.trim(), lastName: c.lastName.trim(), birthMonth: Number(c.birthMonth), birthYear: Number(c.birthYear) })),
        startAt: iso(date, start),
        endAt: iso(date, end),
        notes: notes.trim() || undefined,
      });
      setConfirmedCount(req.childCount);
      if (req.testMode || !req.publishableKey) {
        // No Stripe account linked — the stub auto-charges and confirms.
        await api.post(`/bookings/${req.requestId}/pay`, { stripePaymentIntentId: req.paymentIntentId });
        setStep("done"); window.scrollTo(0, 0);
      } else {
        setCard(req); // collect + charge the card, then finalise the booking
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't submit your booking.");
    } finally {
      setBusy(false);
    }
  }

  if (loadErr) return <div className="grid min-h-screen place-items-center bg-sand px-6 text-center text-ink/60">{loadErr}</div>;
  if (!cfg) return <div className="grid min-h-screen place-items-center bg-sand text-sm text-ink/50">Loading…</div>;

  if (step === "done") {
    return (
      <div className="grid min-h-screen place-items-center bg-sand px-6">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-3xl bg-teal-light text-4xl">✅</div>
          <h1 className="font-display text-3xl font-bold text-ink">Booking confirmed</h1>
          <p className="mt-3 text-lg text-ink/70">
            All set! You&apos;ve been charged <b>{money(perChild * confirmedCount)}</b> for <b>{confirmedCount}</b> {confirmedCount === 1 ? "child" : "children"} on <b>{new Date(`${date}T${start}`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}</b>, {start}–{end}.
          </p>
          <p className="mt-2 text-ink/60">Your place is secured. Please make sure your court booking matches this time. See you at {cfg.facilityName}!</p>
          <button className="btn mt-8 px-6 py-3 text-base" onClick={() => { setStep("session"); setQuote(null); setParent({ firstName: "", lastName: "", phone: "", email: "" }); setChildren([emptyChild()]); setNotes(""); setDate(""); setError(null); }}>
            Make another booking
          </button>
        </div>
      </div>
    );
  }

  const years: number[] = [];
  for (let y = 2026; y >= 2010; y--) years.push(y);
  const estPerChild = date && start && end ? Math.max(0, Math.round(((new Date(`${date}T${end}`).getTime() - new Date(`${date}T${start}`).getTime()) / 3_600_000) * cfg.hourlyRateCents)) : 0;

  return (
    <div className="min-h-screen bg-sand px-4 py-8">
      <div className="mx-auto max-w-xl">
        <header className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-teal text-2xl">🧸</div>
          <h1 className="font-display text-3xl font-bold text-ink">{cfg.facilityName} — Book a session</h1>
          <p className="mt-1 text-ink/60">Pre-book a place for your child. Your card is charged now to secure the booking.</p>
        </header>

        {step === "session" && (
          <div className="space-y-5">
            <CourtNotice />
            <div className="rounded-card border border-line bg-white p-5 sm:p-6">
              <h2 className="font-display text-xl font-bold text-ink">When?</h2>
              <p className="mb-4 mt-0.5 text-sm text-ink/55">Open {cfg.openTime}–{cfg.closeTime} · {money(cfg.hourlyRateCents)}/hour per child</p>
              <div className="space-y-4">
                <Labeled label="Date" required>
                  <input type="date" className={field} min={today} max={maxDate} value={date} onChange={(e) => { setDate(e.target.value); setQuote(null); }} />
                </Labeled>
                <div className="grid grid-cols-2 gap-4">
                  <Labeled label="From" required>
                    <input type="time" className={field} min={cfg.openTime} max={cfg.closeTime} step={1800} value={start} onChange={(e) => { setStart(e.target.value); setQuote(null); }} />
                  </Labeled>
                  <Labeled label="Until" required>
                    <input type="time" className={field} min={cfg.openTime} max={cfg.closeTime} step={1800} value={end} onChange={(e) => { setEnd(e.target.value); setQuote(null); }} />
                  </Labeled>
                </div>
                {estPerChild > 0 && <p className="rounded-lg bg-teal-light/60 px-3 py-2 text-sm text-teal-dark"><b>{money(estPerChild)}</b> per child</p>}
              </div>
              {error && <p className="mt-4 rounded-xl bg-coral/10 px-4 py-3 text-sm text-coral">{error}</p>}
              <button className="btn mt-5 w-full px-6 py-3 text-base" disabled={busy} onClick={checkAndContinue}>{busy ? "Checking…" : "Check availability & continue"}</button>
            </div>
          </div>
        )}

        {step === "details" && (
          <div className="space-y-5">
            <div className="rounded-card border border-teal/30 bg-teal-light/40 p-4 text-sm text-ink/80">
              <b>{new Date(`${date}T${start}`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}</b>, {start}–{end} · {money(perChild || estPerChild)} per child
              <button className="ml-2 text-teal hover:underline" onClick={() => { setStep("session"); setError(null); }}>Change</button>
            </div>

            <CourtNotice />

            <div className="rounded-card border border-line bg-white p-5 sm:p-6">
              <h2 className="mb-4 font-display text-xl font-bold text-ink">Your details</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Labeled label="First name" required><input className={field} value={parent.firstName} onChange={(e) => setParent({ ...parent, firstName: e.target.value })} /></Labeled>
                <Labeled label="Last name" required><input className={field} value={parent.lastName} onChange={(e) => setParent({ ...parent, lastName: e.target.value })} /></Labeled>
                <Labeled label="Mobile / phone" required error={parent.phone.length > 0 && !isAuPhone(parent.phone) ? "Enter a valid Australian number" : undefined}>
                  <input className={field} inputMode="tel" placeholder="0400 123 456" value={parent.phone} onChange={(e) => setParent({ ...parent, phone: e.target.value })} />
                </Labeled>
                <Labeled label="Email (optional)"><input className={field} inputMode="email" value={parent.email} onChange={(e) => setParent({ ...parent, email: e.target.value })} /></Labeled>
              </div>
            </div>

            <div className="rounded-card border border-line bg-white p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-xl font-bold text-ink">Children ({children.length})</h2>
                {perChild > 0 && <span className="rounded-full bg-teal-light px-3 py-1 text-sm font-semibold text-teal-dark">Total {money(totalCents)}</span>}
              </div>
              <div className="space-y-5">
                {children.map((c, i) => (
                  <div key={i} className={i > 0 ? "border-t border-line pt-5" : ""}>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-bold text-ink/70">Child {i + 1}</p>
                      {children.length > 1 && <button className="text-xs font-medium text-coral hover:underline" onClick={() => removeChild(i)}>Remove</button>}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Labeled label="First name" required><input className={field} value={c.firstName} onChange={(e) => setChild(i, { firstName: e.target.value })} /></Labeled>
                      <Labeled label="Last name" required><input className={field} value={c.lastName} onChange={(e) => setChild(i, { lastName: e.target.value })} /></Labeled>
                      <Labeled label="Birth month" required>
                        <select className={field} value={c.birthMonth} onChange={(e) => setChild(i, { birthMonth: e.target.value })}>
                          <option value="">Select…</option>
                          {MONTHS.map((m, mi) => <option key={m} value={mi + 1}>{m}</option>)}
                        </select>
                      </Labeled>
                      <Labeled label="Birth year" required>
                        <select className={field} value={c.birthYear} onChange={(e) => setChild(i, { birthYear: e.target.value })}>
                          <option value="">Select…</option>
                          {years.map((y) => <option key={y} value={y}>{y}</option>)}
                        </select>
                      </Labeled>
                    </div>
                  </div>
                ))}
              </div>
              {children.length < MAX_CHILDREN && (
                <button className="mt-4 rounded-xl border border-dashed border-teal/50 px-4 py-2 text-sm font-semibold text-teal-dark hover:bg-teal-light/40" onClick={addChild}>
                  + Add another child
                </button>
              )}
              {overCapacity && <p className="mt-3 rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">Only {quote?.spacesFree} space(s) left for that session — please remove a child or change the time.</p>}
            </div>

            <div className="rounded-card border border-line bg-white p-5 sm:p-6">
              <Labeled label="Anything we should know? (optional)">
                <textarea className={field} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Labeled>
            </div>

            {error && <p className="rounded-xl bg-coral/10 px-4 py-3 text-sm text-coral">{error}</p>}
            <button className="btn w-full px-6 py-4 text-lg" disabled={!detailsValid || overCapacity || busy} onClick={payAndSubmit}>
              {busy ? "Please wait…" : `Pay ${money(totalCents)} & book`}
            </button>
            <p className="text-center text-xs text-ink/40">Your card is charged now and your booking is confirmed straight away. Cancellations follow the centre&apos;s refund policy.</p>
          </div>
        )}
      </div>

      {card && (
        <StripeCardModal
          clientSecret={card.clientSecret}
          publishableKey={card.publishableKey!}
          feeCents={card.feeCents}
          title={`Pay ${money(card.feeCents)}`}
          subtitle="Your card is charged now to confirm the booking."
          submitLabel={`Pay ${money(card.feeCents)}`}
          onClose={() => setCard(null)}
          onConfirmed={async () => {
            try {
              await api.post(`/bookings/${card.requestId}/pay`, { stripePaymentIntentId: card.paymentIntentId });
              setCard(null);
              setStep("done");
              window.scrollTo(0, 0);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Payment taken, but couldn't finalise — please contact us.");
              setCard(null);
            }
          }}
        />
      )}
    </div>
  );
}

function Labeled({ label, required, error, className, children }: { label: string; required?: boolean; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-sm font-semibold text-ink/70">{label}{required && <span className="text-coral"> *</span>}</label>
      {children}
      {error && <p className="mt-1 text-xs text-coral">{error}</p>}
    </div>
  );
}

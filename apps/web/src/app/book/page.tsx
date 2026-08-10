"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { isAuPhone } from "@/lib/phone";
import { BookingConfig, money } from "@/lib/types";
import StripeCardModal from "@/components/StripeCardModal";

const field =
  "w-full rounded-xl border border-line bg-white px-4 py-3 text-base text-ink placeholder:text-ink/40 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/40";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface RequestResp {
  requestId: string;
  feeCents: number;
  clientSecret: string;
  publishableKey: string | null;
  testMode: boolean;
  paymentIntentId: string;
}

export default function BookPage() {
  const [cfg, setCfg] = useState<BookingConfig | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [step, setStep] = useState<"session" | "details" | "done">("session");

  // Session
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [quote, setQuote] = useState<{ feeCents: number; spacesFree: number } | null>(null);

  // Details
  const [parent, setParent] = useState({ firstName: "", lastName: "", phone: "", email: "" });
  const [child, setChild] = useState({ firstName: "", lastName: "", birthMonth: "", birthYear: "" });
  const [notes, setNotes] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState<RequestResp | null>(null);

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

  async function checkAndContinue() {
    if (!date || !start || !end) return setError("Please pick a date and times.");
    setBusy(true); setError(null);
    try {
      const q = await api.post<{ ok: boolean; feeCents: number; spacesFree: number }>("/bookings/quote", { startAt: iso(date, start), endAt: iso(date, end) });
      setQuote({ feeCents: q.feeCents, spacesFree: q.spacesFree });
      if (!q.ok) { setError("That session is full — please choose a different day or time."); return; }
      setStep("details");
      window.scrollTo(0, 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't check that time.");
    } finally {
      setBusy(false);
    }
  }

  const detailsValid =
    parent.firstName.trim() && parent.lastName.trim() && isAuPhone(parent.phone) &&
    child.firstName.trim() && child.lastName.trim() && child.birthMonth && child.birthYear;

  async function payAndSubmit() {
    if (!detailsValid) return;
    setBusy(true); setError(null);
    try {
      const req = await api.post<RequestResp>("/bookings", {
        parent: { firstName: parent.firstName.trim(), lastName: parent.lastName.trim(), phone: parent.phone.trim(), email: parent.email.trim() || undefined },
        child: { firstName: child.firstName.trim(), lastName: child.lastName.trim(), birthMonth: Number(child.birthMonth), birthYear: Number(child.birthYear) },
        startAt: iso(date, start),
        endAt: iso(date, end),
        notes: notes.trim() || undefined,
      });
      if (req.testMode || !req.publishableKey) {
        // No Stripe account linked — the stub payment already "succeeded".
        await api.post(`/bookings/${req.requestId}/pay`, { stripePaymentIntentId: req.paymentIntentId });
        setStep("done"); window.scrollTo(0, 0);
      } else {
        setCard(req); // collect the card, then record on success
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
          <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-3xl bg-teal-light text-4xl">📅</div>
          <h1 className="font-display text-3xl font-bold text-ink">Booking requested</h1>
          <p className="mt-3 text-lg text-ink/70">
            Thanks! We&apos;ve received your payment of <b>{money(quote?.feeCents ?? 0)}</b> and your booking for <b>{child.firstName}</b> on <b>{new Date(`${date}T${start}`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}</b>, {start}–{end}.
          </p>
          <p className="mt-2 text-ink/60">{cfg.facilityName} will confirm shortly. If we can&apos;t accommodate it, you&apos;ll be fully refunded.</p>
          <button className="btn mt-8 px-6 py-3 text-base" onClick={() => { setStep("session"); setQuote(null); setParent({ firstName: "", lastName: "", phone: "", email: "" }); setChild({ firstName: "", lastName: "", birthMonth: "", birthYear: "" }); setNotes(""); setDate(""); setError(null); }}>
            Make another booking
          </button>
        </div>
      </div>
    );
  }

  const years: number[] = [];
  for (let y = 2026; y >= 2010; y--) years.push(y);
  const estFee = date && start && end ? Math.max(0, Math.round(((new Date(`${date}T${end}`).getTime() - new Date(`${date}T${start}`).getTime()) / 3_600_000) * cfg.hourlyRateCents)) : 0;

  return (
    <div className="min-h-screen bg-sand px-4 py-8">
      <div className="mx-auto max-w-xl">
        <header className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-teal text-2xl">🧸</div>
          <h1 className="font-display text-3xl font-bold text-ink">{cfg.facilityName} — Book a session</h1>
          <p className="mt-1 text-ink/60">Pre-book a place for your child. Payment is taken now and refunded if we can&apos;t confirm.</p>
        </header>

        {step === "session" && (
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
              {estFee > 0 && <p className="rounded-lg bg-teal-light/60 px-3 py-2 text-sm text-teal-dark">Estimated fee: <b>{money(estFee)}</b></p>}
            </div>
            {error && <p className="mt-4 rounded-xl bg-coral/10 px-4 py-3 text-sm text-coral">{error}</p>}
            <button className="btn mt-5 w-full px-6 py-3 text-base" disabled={busy} onClick={checkAndContinue}>{busy ? "Checking…" : "Check availability & continue"}</button>
          </div>
        )}

        {step === "details" && (
          <div className="space-y-5">
            <div className="rounded-card border border-teal/30 bg-teal-light/40 p-4 text-sm text-ink/80">
              <b>{new Date(`${date}T${start}`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}</b>, {start}–{end} · Fee <b>{money(quote?.feeCents ?? estFee)}</b>
              <button className="ml-2 text-teal hover:underline" onClick={() => { setStep("session"); setError(null); }}>Change</button>
            </div>

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
              <h2 className="mb-4 font-display text-xl font-bold text-ink">Child&apos;s details</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Labeled label="First name" required><input className={field} value={child.firstName} onChange={(e) => setChild({ ...child, firstName: e.target.value })} /></Labeled>
                <Labeled label="Last name" required><input className={field} value={child.lastName} onChange={(e) => setChild({ ...child, lastName: e.target.value })} /></Labeled>
                <Labeled label="Birth month" required>
                  <select className={field} value={child.birthMonth} onChange={(e) => setChild({ ...child, birthMonth: e.target.value })}>
                    <option value="">Select…</option>
                    {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                </Labeled>
                <Labeled label="Birth year" required>
                  <select className={field} value={child.birthYear} onChange={(e) => setChild({ ...child, birthYear: e.target.value })}>
                    <option value="">Select…</option>
                    {years.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </Labeled>
                <Labeled label="Anything we should know? (optional)" className="sm:col-span-2">
                  <textarea className={field} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </Labeled>
              </div>
            </div>

            {error && <p className="rounded-xl bg-coral/10 px-4 py-3 text-sm text-coral">{error}</p>}
            <button className="btn w-full px-6 py-4 text-lg" disabled={!detailsValid || busy} onClick={payAndSubmit}>
              {busy ? "Please wait…" : `Pay ${money(quote?.feeCents ?? estFee)} & request booking`}
            </button>
            <p className="text-center text-xs text-ink/40">You&apos;ll be charged now. If we can&apos;t confirm the session, you&apos;re fully refunded.</p>
          </div>
        )}
      </div>

      {card && (
        <StripeCardModal
          clientSecret={card.clientSecret}
          publishableKey={card.publishableKey!}
          feeCents={card.feeCents}
          title={`Pay ${money(card.feeCents)}`}
          subtitle="Enter your card details to secure the booking."
          onClose={() => setCard(null)}
          onConfirmed={async () => {
            try {
              await api.post(`/bookings/${card.requestId}/pay`, { stripePaymentIntentId: card.paymentIntentId });
              setCard(null);
              setStep("done");
              window.scrollTo(0, 0);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Charged, but couldn't record it — please contact us.");
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

"use client";

import { FormEvent, useMemo, useState } from "react";
import { loadStripe, Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { money } from "@/lib/types";

// Cache one Stripe.js instance per publishable key across modal opens.
const stripeCache: Record<string, Promise<Stripe | null>> = {};
function stripeFor(pk: string): Promise<Stripe | null> {
  if (!stripeCache[pk]) stripeCache[pk] = loadStripe(pk);
  return stripeCache[pk];
}

interface Props {
  clientSecret: string;
  publishableKey: string;
  feeCents: number;
  title?: string;
  subtitle?: string;
  // Label for the submit button (e.g. "Pay $10" for a charge, "Confirm card"
  // for an authorisation hold). Defaults to a Pay label.
  submitLabel?: string;
  onConfirmed: () => void; // card charged or authorised — record it
  onClose: () => void;
}

/** Collects and confirms a card payment via Stripe Elements. Works for both an
 *  immediate charge (status → succeeded) and a manual-capture hold (status →
 *  requires_capture); both are treated as success. */
export default function StripeCardModal({ clientSecret, publishableKey, feeCents, title, subtitle, submitLabel, onConfirmed, onClose }: Props) {
  const stripePromise = useMemo(() => stripeFor(publishableKey), [publishableKey]);
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-card bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-lg font-bold text-ink">{title ?? `Card payment · ${money(feeCents)}`}</h2>
        <p className="mt-1 text-sm text-ink/60">{subtitle ?? "Enter the card details to charge the fee."}</p>
        <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe" } }}>
          <CardForm feeCents={feeCents} submitLabel={submitLabel} onConfirmed={onConfirmed} onClose={onClose} />
        </Elements>
      </div>
    </div>
  );
}

function CardForm({ feeCents, submitLabel, onConfirmed, onClose }: { feeCents: number; submitLabel?: string; onConfirmed: () => void; onClose: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setErr(null);
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: { return_url: window.location.href },
    });
    if (error) {
      setErr(error.message ?? "The card was declined.");
      setBusy(false);
      return;
    }
    // "succeeded" = charged (immediate capture); "requires_capture" = card
    // authorised/held (manual capture, captured later on staff approval).
    if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "requires_capture") {
      onConfirmed();
      return;
    }
    setErr(`Payment status: ${paymentIntent?.status ?? "unknown"}. Try again.`);
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-4">
      <PaymentElement />
      {err && <p className="rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">{err}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn-secondary flex-1" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" className="btn flex-1" disabled={busy || !stripe}>{busy ? "Please wait…" : (submitLabel ?? `Pay ${money(feeCents)}`)}</button>
      </div>
    </form>
  );
}

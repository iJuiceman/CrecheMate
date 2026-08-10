"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Settings } from "@/lib/types";

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<Settings>("/settings").then(setS).catch((e) => setError(e.message));
  }, []);

  async function save() {
    if (!s) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await api.patch<Settings>("/settings", {
        name: s.name,
        capacity: s.capacity,
        hourlyRateCents: s.hourlyRateCents,
        openTime: s.openTime,
        closeTime: s.closeTime,
        timezone: s.timezone,
        abn: s.abn || undefined,
        waiverText: s.waiverText ?? undefined,
      });
      setS(updated);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  if (!s) return <div className="p-6 text-sm text-ink/50">{error ?? "Loading…"}</div>;

  return (
    <div className="p-6">
      <h1 className="font-display text-2xl font-bold text-ink">Settings</h1>
      <div className="card mt-4 max-w-lg space-y-4">
        <div>
          <label className="label">Service name</label>
          <input className="field" value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Capacity (max concurrent children)</label>
            <input type="number" min={1} className="field" value={s.capacity} onChange={(e) => setS({ ...s, capacity: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">Hourly rate (per child)</label>
            <div className="flex items-center gap-1">
              <span className="text-ink/50">$</span>
              <input type="number" min={0} step="0.5" className="field" value={(s.hourlyRateCents / 100).toString()} onChange={(e) => setS({ ...s, hourlyRateCents: Math.round(Number(e.target.value) * 100) })} />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Opens</label><input type="time" className="field" value={s.openTime} onChange={(e) => setS({ ...s, openTime: e.target.value })} /></div>
          <div><label className="label">Closes</label><input type="time" className="field" value={s.closeTime} onChange={(e) => setS({ ...s, closeTime: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Timezone</label><input className="field" value={s.timezone} onChange={(e) => setS({ ...s, timezone: e.target.value })} /></div>
          <div><label className="label">ABN (for receipts, optional)</label><input className="field" value={s.abn ?? ""} onChange={(e) => setS({ ...s, abn: e.target.value })} /></div>
        </div>
        {error && <p className="rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p>}
        {saved && <p className="rounded-lg bg-teal-light px-3 py-2 text-sm text-teal-dark">Saved.</p>}
        <button className="btn" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save settings"}</button>
      </div>

      {/* Parent registration + waiver */}
      <div className="card mt-4 max-w-lg space-y-4">
        <div>
          <h2 className="font-display text-lg font-bold text-ink">Parent registration & waiver</h2>
          <p className="mt-1 text-sm text-ink/60">Parents self-register on an iPad and sign this waiver with their finger. Open the kiosk form at:</p>
          <p className="mt-2 rounded-lg bg-sand px-3 py-2 font-mono text-sm text-ink/80">
            {typeof window !== "undefined" ? `${window.location.origin}/intake` : "/intake"}
          </p>
          <a href="/intake" target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-medium text-teal hover:underline">Open the parent form ↗</a>
        </div>
        <div>
          <label className="label">Waiver text <span className="font-normal text-ink/40">(shown to parents · v{s.waiverVersion})</span></label>
          <textarea
            className="field font-sans"
            rows={12}
            value={s.waiverText ?? ""}
            placeholder="Leave blank to use the built-in default waiver."
            onChange={(e) => setS({ ...s, waiverText: e.target.value })}
          />
          <p className="mt-1 text-xs text-ink/50">Editing the wording bumps the version, so each parent&apos;s signature stays tied to the exact text they signed. Have your own waiver reviewed before going live.</p>
        </div>
        <button className="btn" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save waiver"}</button>
      </div>

      <PaymentsSection settings={s} onChange={setS} />
    </div>
  );
}

function PaymentsSection({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const [secretKey, setSecretKey] = useState("");
  const [publishableKey, setPublishableKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const liveMode = settings.stripePublishableKey?.startsWith("pk_live_");

  async function link() {
    if (!secretKey || !publishableKey) return setErr("Enter both the secret and publishable keys.");
    setBusy(true); setErr(null);
    try {
      const updated = await api.post<Settings>("/settings/stripe", { secretKey: secretKey.trim(), publishableKey: publishableKey.trim() });
      onChange(updated);
      setSecretKey(""); setPublishableKey("");
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't link Stripe."); }
    finally { setBusy(false); }
  }

  async function unlink() {
    setBusy(true); setErr(null);
    try {
      const updated = await api.del<Settings>("/settings/stripe");
      onChange(updated);
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't unlink Stripe."); }
    finally { setBusy(false); }
  }

  return (
    <div className="card mt-4 max-w-lg space-y-4">
      <div>
        <h2 className="font-display text-lg font-bold text-ink">Payments — Stripe</h2>
        <p className="mt-1 text-sm text-ink/60">Link your Stripe account to take real card payments for online fees. Find your keys in the Stripe Dashboard under Developers → API keys.</p>
      </div>

      {settings.stripeConfigured ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-teal-light px-2 py-0.5 text-xs font-semibold text-teal-dark">Linked</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${liveMode ? "bg-coral/10 text-coral" : "bg-sand text-ink/60"}`}>{liveMode ? "LIVE — real charges" : "Test keys"}</span>
          </div>
          <p className="text-sm text-ink/60">Publishable key: <span className="font-mono text-ink/80">{settings.stripePublishableKey}</span></p>
          <p className="text-xs text-ink/50">The secret key is stored encrypted and never shown again. Unlinking reverts online payments to test-mode stubs.</p>
          {err && <p className="rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">{err}</p>}
          <button className="btn-secondary" onClick={unlink} disabled={busy}>{busy ? "Working…" : "Unlink Stripe account"}</button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg bg-sand px-3 py-2 text-xs text-ink/60">
            Not linked — online card payments run in <b>test mode</b> (auto-succeed stubs, no real money moves).
          </div>
          <div>
            <label className="label">Secret key (sk_…)</label>
            <input className="field font-mono" placeholder="sk_live_… or sk_test_…" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} autoComplete="off" spellCheck={false} />
          </div>
          <div>
            <label className="label">Publishable key (pk_…)</label>
            <input className="field font-mono" placeholder="pk_live_… or pk_test_…" value={publishableKey} onChange={(e) => setPublishableKey(e.target.value)} autoComplete="off" spellCheck={false} />
          </div>
          <p className="text-xs text-ink/50">Both keys must be from the same mode. We verify the secret key with Stripe before saving.</p>
          {err && <p className="rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">{err}</p>}
          <button className="btn" onClick={link} disabled={busy}>{busy ? "Verifying…" : "Link Stripe account"}</button>
        </div>
      )}
    </div>
  );
}

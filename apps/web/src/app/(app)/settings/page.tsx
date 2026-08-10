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
    </div>
  );
}

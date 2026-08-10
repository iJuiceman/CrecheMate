"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

interface StaffRow {
  id: string;
  username: string;
  email: string | null;
  firstName: string;
  lastName: string;
  role: "admin" | "educator";
  status: "active" | "suspended";
  lastLoginAt: string | null;
}

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [temp, setTemp] = useState<{ username: string; password: string } | null>(null);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(() => {
    api.get<StaffRow[]>("/staff").then(setStaff).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That action failed.");
    }
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink">Staff</h1>
        <button className="btn" onClick={() => setShowNew(true)}>+ Add staff</button>
      </div>
      {error && <p className="mb-4 rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p>}
      {temp && (
        <div className="mb-4 rounded-lg border border-line bg-teal-light px-3 py-2 text-sm text-ink">
          One-time password for <b>{temp.username}</b>: <span className="font-mono font-bold">{temp.password}</span>
          <button className="ml-3 text-xs text-ink/60 hover:underline" onClick={() => setTemp(null)}>Dismiss</button>
        </div>
      )}

      <div className="space-y-2">
        {staff.map((u) => (
          <div key={u.id} className={`card flex items-center justify-between ${u.status === "suspended" ? "opacity-60" : ""}`}>
            <div>
              <p className="font-semibold text-ink">{u.firstName} {u.lastName} <span className="ml-1 rounded-full bg-sand px-2 py-0.5 text-xs font-medium capitalize text-ink/60">{u.role}</span>{u.status === "suspended" && <span className="ml-1 rounded-full bg-coral/10 px-2 py-0.5 text-xs font-semibold text-coral">suspended</span>}</p>
              <p className="text-sm text-ink/50"><span className="font-mono text-ink/70">{u.username}</span>{u.email ? ` · ${u.email}` : ""} · last sign-in {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("en-AU") : "never"}</p>
            </div>
            <div className="flex gap-3 text-xs font-medium">
              <button className="text-teal" onClick={() => act(async () => setTemp({ username: u.username, password: (await api.post<{ temporaryPassword: string }>(`/staff/${u.id}/reset-password`)).temporaryPassword }))}>Reset password</button>
              {u.status === "active"
                ? <button className="text-coral" onClick={() => act(() => api.patch(`/staff/${u.id}`, { status: "suspended" }))}>Suspend</button>
                : <button className="text-teal" onClick={() => act(() => api.patch(`/staff/${u.id}`, { status: "active" }))}>Reactivate</button>}
            </div>
          </div>
        ))}
      </div>

      {showNew && <NewStaff onClose={() => setShowNew(false)} onCreated={(t) => { setShowNew(false); setTemp(t); load(); }} />}
    </div>
  );
}

function NewStaff({ onClose, onCreated }: { onClose: () => void; onCreated: (t: { username: string; password: string } | null) => void }) {
  const [f, setF] = useState({ firstName: "", lastName: "", username: "", email: "", role: "educator" as "admin" | "educator" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    if (!f.firstName || !f.lastName || !f.username) return setErr("First name, last name and username are required.");
    setBusy(true); setErr(null);
    try {
      const body = { ...f, email: f.email || undefined };
      const res = await api.post<{ username: string; temporaryPassword?: string }>("/staff", body);
      onCreated(res.temporaryPassword ? { username: res.username, password: res.temporaryPassword } : null);
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't add staff."); setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30" onClick={onClose}>
      <div className="flex h-full w-full max-w-md flex-col bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 font-display text-lg font-bold text-ink">Add staff member</h2>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input className="field" placeholder="First name" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} />
            <input className="field" placeholder="Last name" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} />
          </div>
          <input className="field" placeholder="Username (for sign-in)" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} autoCapitalize="none" spellCheck={false} />
          <input className="field" placeholder="Email (optional — receipts/records)" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <select className="field" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as "admin" | "educator" })}>
            <option value="educator">Educator (day-to-day)</option>
            <option value="admin">Admin (also manages settings & staff)</option>
          </select>
          <p className="text-xs text-ink/50">A one-time password is generated and shown once — hand it to them to sign in and change.</p>
        </div>
        {err && <p className="mt-3 text-sm text-coral">{err}</p>}
        <div className="mt-auto flex gap-2 pt-5">
          <button className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
          <button className="btn flex-1" onClick={save} disabled={busy}>{busy ? "Adding…" : "Add staff"}</button>
        </div>
      </div>
    </div>
  );
}

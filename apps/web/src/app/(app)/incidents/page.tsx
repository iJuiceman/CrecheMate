"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Guardian, INCIDENT_TYPES, Incident, incidentTypeLabel } from "@/lib/types";

export default function IncidentsPage() {
  const { user } = useAuth();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(() => {
    api.get<Incident[]>("/incidents").then(setIncidents).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function remove(id: string) {
    if (!confirm("Delete this incident record? This can't be undone.")) return;
    setError(null);
    try {
      await api.del(`/incidents/${id}`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete the incident.");
    }
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink">Incidents</h1>
        <button className="btn" onClick={() => setShowNew(true)}>+ Log incident</button>
      </div>
      {error && <p className="mb-4 rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p>}

      {incidents.length === 0 && !error && (
        <p className="rounded-card border border-dashed border-line px-4 py-8 text-center text-sm text-ink/50">
          No incidents logged. Use “Log incident” to record one — whether staff noticed it or a parent reported it.
        </p>
      )}

      <div className="space-y-2">
        {incidents.map((inc) => (
          <div key={inc.id} className="card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-ink">
                  {inc.child ? inc.child.name : "No specific child"}
                  <span className="ml-2 text-sm font-normal text-ink/50">
                    {new Date(inc.occurredAt).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {inc.types.map((t) => (
                    <span key={t} className={`rounded-full px-2 py-0.5 text-xs font-medium ${t === "allergic_reaction" ? "bg-coral/10 text-coral" : "bg-sand text-ink/70"}`}>
                      {incidentTypeLabel(t)}
                    </span>
                  ))}
                </div>
                {inc.description && <p className="mt-2 whitespace-pre-wrap text-sm text-ink/80">{inc.description}</p>}
                <p className="mt-2 text-xs text-ink/50">
                  Reported by {inc.reportedBy === "parent" ? `parent${inc.reporterName ? ` (${inc.reporterName})` : ""}` : "staff"}
                  {inc.loggedBy ? ` · logged by ${inc.loggedBy}` : ""}
                </p>
              </div>
              {user?.role === "admin" && (
                <button className="shrink-0 text-xs font-medium text-coral" onClick={() => remove(inc.id)}>Delete</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showNew && <NewIncident onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} />}
    </div>
  );
}

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time.
function localNow(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function NewIncident({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [children, setChildren] = useState<{ id: string; name: string }[]>([]);
  const [f, setF] = useState({
    childId: "",
    occurredAt: localNow(),
    reportedBy: "staff" as "staff" | "parent",
    reporterName: "",
    types: [] as string[],
    description: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get<Guardian[]>("/families")
      .then((fams) => setChildren(
        fams.flatMap((g) => g.children.filter((c) => c.active).map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}` })))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ))
      .catch(() => {});
  }, []);

  function toggleType(key: string) {
    setF((prev) => ({
      ...prev,
      types: prev.types.includes(key) ? prev.types.filter((t) => t !== key) : [...prev.types, key],
    }));
  }

  async function save() {
    if (f.types.length === 0) return setErr("Tick at least one incident type.");
    if (f.types.includes("other") && !f.description.trim()) return setErr("Describe the incident when “Other” is ticked.");
    if (f.reportedBy === "parent" && !f.reporterName.trim()) return setErr("Enter the parent's name.");
    if (!f.occurredAt) return setErr("Enter when the incident occurred.");
    setBusy(true); setErr(null);
    try {
      await api.post("/incidents", {
        childId: f.childId || undefined,
        occurredAt: new Date(f.occurredAt).toISOString(),
        reportedBy: f.reportedBy,
        reporterName: f.reportedBy === "parent" ? f.reporterName.trim() : undefined,
        types: f.types,
        description: f.description.trim() || undefined,
      });
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't log the incident.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30" onClick={onClose}>
      <div className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 font-display text-lg font-bold text-ink">Log an incident</h2>
        <div className="space-y-3">
          <div>
            <label className="label">Child involved</label>
            <select className="field" value={f.childId} onChange={(e) => setF({ ...f, childId: e.target.value })}>
              <option value="">No specific child</option>
              {children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">When it happened</label>
            <input type="datetime-local" className="field" value={f.occurredAt} onChange={(e) => setF({ ...f, occurredAt: e.target.value })} />
          </div>
          <div>
            <label className="label">Reported by</label>
            <select className="field" value={f.reportedBy} onChange={(e) => setF({ ...f, reportedBy: e.target.value as "staff" | "parent" })}>
              <option value="staff">Staff (we noticed it)</option>
              <option value="parent">Parent (reported to us)</option>
            </select>
          </div>
          {f.reportedBy === "parent" && (
            <input className="field" placeholder="Parent's name" value={f.reporterName} onChange={(e) => setF({ ...f, reporterName: e.target.value })} />
          )}
          <div>
            <label className="label">What happened</label>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {INCIDENT_TYPES.map((t) => (
                <label key={t.key} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    className="h-5 w-5 rounded border-line text-teal focus:ring-teal"
                    checked={f.types.includes(t.key)}
                    onChange={() => toggleType(t.key)}
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="label">{f.types.includes("other") ? "Describe the incident" : "Additional details (optional)"}</label>
            <textarea
              className="field min-h-24"
              rows={4}
              maxLength={2000}
              placeholder={f.types.includes("other") ? "What happened?" : "Anything else worth recording — first aid given, parent informed…"}
              value={f.description}
              onChange={(e) => setF({ ...f, description: e.target.value })}
            />
          </div>
        </div>
        {err && <p className="mt-3 rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">{err}</p>}
        <div className="mt-auto flex gap-2 pt-5">
          <button className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
          <button className="btn flex-1" onClick={save} disabled={busy}>{busy ? "Saving…" : "Log incident"}</button>
        </div>
      </div>
    </div>
  );
}

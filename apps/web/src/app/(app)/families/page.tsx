"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { EmergencyContact, Guardian } from "@/lib/types";
import RelationshipSelect from "@/components/RelationshipSelect";
import { isAuPhone } from "@/lib/phone";

export default function FamiliesPage() {
  const [families, setFamilies] = useState<Guardian[]>([]);
  const [q, setQ] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get<Guardian[]>(`/families${q.trim() ? `?query=${encodeURIComponent(q.trim())}` : ""}`).then(setFamilies).catch((e) => setError(e.message));
  }, [q]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink">Families &amp; children</h1>
        <button className="btn" onClick={() => setShowNew(true)}>+ New family</button>
      </div>
      <input className="field mb-4 max-w-md" placeholder="Search by child or parent name / phone…" value={q} onChange={(e) => setQ(e.target.value)} />
      {error && <p className="mb-4 rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p>}

      <div className="space-y-2">
        {families.map((g) => (
          <Link key={g.id} href={`/families/${g.id}`} className="block card transition-colors hover:border-teal">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-ink">{g.firstName} {g.lastName} <span className="text-sm font-normal text-ink/50">· {g.phone}</span></p>
                <p className="text-sm text-ink/60">
                  {g.children.length
                    ? g.children.map((c) => `${c.firstName}${c.age != null ? ` (${c.age})` : ""}`).join(", ")
                    : "No children yet"}
                </p>
              </div>
              <span className="flex gap-2">
                {g.children.some((c) => c.hasMedicalNotes) && <span className="rounded-full bg-coral/10 px-2 py-0.5 text-xs font-semibold text-coral">⚕ medical</span>}
                {!g.waiverSigned && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">✍ no waiver</span>}
              </span>
            </div>
          </Link>
        ))}
        {families.length === 0 && <p className="rounded-card border border-dashed border-line p-8 text-center text-sm text-ink/50">No families{q ? " match your search" : " yet"}.</p>}
      </div>

      {showNew && <NewFamily onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} />}
    </div>
  );
}

const nowYear = new Date().getFullYear();
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const BIRTH_YEARS: number[] = [];
for (let y = nowYear; y >= 2010; y--) BIRTH_YEARS.push(y);

function NewFamily({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [g, setG] = useState({ firstName: "", lastName: "", relationship: "mother", phone: "", email: "", addressLine: "", suburb: "", postcode: "" });
  const [g2, setG2] = useState({ firstName: "", lastName: "", relationship: "father", phone: "", email: "" });
  const [child, setChild] = useState({ firstName: "", lastName: "", birthMonth: "", birthYear: "", medicalNotes: "" });
  // Parents are emergency contacts automatically — extra contacts are optional.
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!g.firstName || !g.lastName || !g.phone) return setError("Parent name and phone are required.");
    if (!isAuPhone(g.phone)) return setError("Enter a valid Australian phone number for the parent.");
    if (g2.phone && !isAuPhone(g2.phone)) return setError("Enter a valid Australian phone number for the second parent.");
    if (!child.firstName || !child.lastName) return setError("The child's name is required.");
    const validContacts = contacts.filter((c) => c.name.trim() && c.phone.trim());
    if (contacts.some((c) => c.name.trim() && !c.phone.trim())) return setError("Each added emergency contact needs a phone number.");
    setBusy(true);
    setError(null);
    try {
      await api.post("/families", {
        guardian: {
          ...g, lastName: g.lastName, email: g.email || undefined, addressLine: g.addressLine || undefined, suburb: g.suburb || undefined, postcode: g.postcode || undefined, relationship: g.relationship || undefined,
          secondFirstName: g2.firstName || undefined,
          secondLastName: g2.firstName ? g2.lastName || undefined : undefined,
          secondRelationship: g2.firstName ? g2.relationship || undefined : undefined,
          // No nameless orphan contact details: second-parent phone/email only
          // ride along when a second parent is actually named.
          secondPhone: g2.firstName && g2.phone ? g2.phone : undefined,
          secondEmail: g2.firstName && g2.email ? g2.email : undefined,
        },
        child: {
          firstName: child.firstName,
          lastName: child.lastName,
          birthMonth: child.birthMonth ? Number(child.birthMonth) : undefined,
          birthYear: child.birthYear ? Number(child.birthYear) : undefined,
          medicalNotes: child.medicalNotes || undefined,
          emergencyContacts: validContacts.map((c) => ({ name: c.name, relationship: c.relationship || undefined, phone: c.phone, canPickup: c.canPickup })),
        },
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the family.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30" onClick={onClose}>
      <div className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-lg font-bold text-ink">New family</h2>

        <h3 className="mt-4 text-sm font-bold text-ink">Parent / guardian</h3>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input className="field" placeholder="First name" value={g.firstName} onChange={(e) => setG({ ...g, firstName: e.target.value })} />
          <input className="field" placeholder="Last name" value={g.lastName} onChange={(e) => setG({ ...g, lastName: e.target.value })} />
          <select className="field" value={g.relationship} onChange={(e) => setG({ ...g, relationship: e.target.value })}>
            {["mother", "father", "guardian", "carer"].map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <input className="field" placeholder="Phone" value={g.phone} onChange={(e) => setG({ ...g, phone: e.target.value })} />
          <input className="field col-span-2" placeholder="Email (optional)" value={g.email} onChange={(e) => setG({ ...g, email: e.target.value })} />
          <input className="field col-span-2" placeholder="Street address (optional)" value={g.addressLine} onChange={(e) => setG({ ...g, addressLine: e.target.value })} />
          <input className="field" placeholder="Suburb" value={g.suburb} onChange={(e) => setG({ ...g, suburb: e.target.value })} />
          <input className="field" placeholder="Postcode" value={g.postcode} onChange={(e) => setG({ ...g, postcode: e.target.value })} />
        </div>

        <h3 className="mt-5 text-sm font-bold text-ink">Second parent / guardian <span className="font-normal text-ink/40">(optional)</span></h3>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input className="field" placeholder="First name" value={g2.firstName} onChange={(e) => setG2({ ...g2, firstName: e.target.value })} />
          <input className="field" placeholder="Last name" value={g2.lastName} onChange={(e) => setG2({ ...g2, lastName: e.target.value })} />
          <select className="field" value={g2.relationship} onChange={(e) => setG2({ ...g2, relationship: e.target.value })}>
            {["mother", "father", "guardian", "carer"].map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <input className="field" placeholder="Phone" value={g2.phone} onChange={(e) => setG2({ ...g2, phone: e.target.value })} />
          <input className="field col-span-2" placeholder="Email (optional)" value={g2.email} onChange={(e) => setG2({ ...g2, email: e.target.value })} />
        </div>

        <h3 className="mt-5 text-sm font-bold text-ink">Child</h3>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input className="field" placeholder="First name" value={child.firstName} onChange={(e) => setChild({ ...child, firstName: e.target.value })} />
          <input className="field" placeholder="Last name" value={child.lastName} onChange={(e) => setChild({ ...child, lastName: e.target.value })} />
          <select className="field" value={child.birthMonth} onChange={(e) => setChild({ ...child, birthMonth: e.target.value })}>
            <option value="">Birth month…</option>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select className="field" value={child.birthYear} onChange={(e) => setChild({ ...child, birthYear: e.target.value })}>
            <option value="">Birth year…</option>
            {BIRTH_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <textarea className="field col-span-2" rows={2} placeholder="Allergies & medical requirements — anything the educator must know" value={child.medicalNotes} onChange={(e) => setChild({ ...child, medicalNotes: e.target.value })} />
        </div>

        <h3 className="mt-5 text-sm font-bold text-ink">Additional emergency contacts</h3>
        <p className="text-xs text-ink/50">The parents/guardians above are emergency contacts automatically. Add anyone else who may need to be called, and tick who is authorised to collect the child.</p>
        <div className="mt-2 space-y-2">
          {contacts.map((c, i) => (
            <div key={i} className="grid grid-cols-12 items-start gap-2">
              <input className="field col-span-4" placeholder="Name" value={c.name} onChange={(e) => setContacts(contacts.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
              <div className="col-span-3"><RelationshipSelect value={c.relationship ?? ""} onChange={(v) => setContacts(contacts.map((x, j) => j === i ? { ...x, relationship: v } : x))} /></div>
              <input className="field col-span-3" placeholder="Phone" value={c.phone} onChange={(e) => setContacts(contacts.map((x, j) => j === i ? { ...x, phone: e.target.value } : x))} />
              <label className="col-span-1 flex items-center gap-1 pt-2.5 text-xs text-ink/60">
                <input type="checkbox" checked={c.canPickup} onChange={(e) => setContacts(contacts.map((x, j) => j === i ? { ...x, canPickup: e.target.checked } : x))} /> pickup
              </label>
              <button className="col-span-1 pt-2 text-left text-xs text-coral hover:underline" onClick={() => setContacts(contacts.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
        </div>
        <button className="mt-2 text-sm font-medium text-teal" onClick={() => setContacts([...contacts, { name: "", relationship: "", phone: "", canPickup: true }])}>+ Add an emergency contact</button>

        {error && <p className="mt-4 rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p>}
        <div className="mt-auto flex gap-2 pt-5">
          <button className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
          <button className="btn flex-1" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Create family"}</button>
        </div>
      </div>
    </div>
  );
}

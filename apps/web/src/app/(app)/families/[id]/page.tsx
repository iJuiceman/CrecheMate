"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ChildFull, EmergencyContact, Guardian } from "@/lib/types";

export default function FamilyDetail({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [family, setFamily] = useState<Guardian | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editGuardian, setEditGuardian] = useState(false);
  const [addChild, setAddChild] = useState(false);

  const load = useCallback(() => {
    api.get<Guardian>(`/families/${params.id}`).then(setFamily).catch((e) => setError(e.message));
  }, [params.id]);
  useEffect(load, [load]);

  if (!family) return <div className="p-6 text-sm text-ink/50">{error ?? "Loading…"}</div>;

  return (
    <div className="p-6">
      <Link href="/families" className="text-sm font-medium text-teal">← Families</Link>
      <div className="mt-2 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink">{family.firstName} {family.lastName}</h1>
        <button className="btn-secondary" onClick={() => setEditGuardian(true)}>Edit parent details</button>
      </div>
      {error && <p className="mt-3 rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p>}
      {notice && <p className="mt-3 rounded-lg bg-teal-light px-3 py-2 text-sm text-teal-dark">{notice}</p>}

      {/* Parent details */}
      <div className="card mt-4">
        <p className="label">Parent / guardian</p>
        <p className="text-ink">{family.firstName} {family.lastName}{family.relationship ? ` · ${family.relationship}` : ""}</p>
        <p className="text-sm text-ink/70">{family.phone}{family.email ? ` · ${family.email}` : ""}</p>
        {(family.addressLine || family.suburb) && (
          <p className="text-sm text-ink/60">{[family.addressLine, family.suburb, family.postcode].filter(Boolean).join(", ")}</p>
        )}
        <div className="mt-3 border-t border-line pt-3">
          {family.waiverSigned ? (
            <WaiverStatus family={family} />
          ) : (
            <p className="text-sm text-ink/50">Waiver: <span className="text-ink/70">not signed</span> (family added by staff)</p>
          )}
        </div>
      </div>

      {/* Children */}
      <div className="mt-5 flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-ink">Children</h2>
        <button className="btn" onClick={() => setAddChild(true)}>+ Add child</button>
      </div>
      <div className="mt-2 space-y-3">
        {family.children.map((c) => (
          <ChildCard key={c.id} child={c} onChange={load} onNotice={setNotice} onError={setError} />
        ))}
      </div>

      {editGuardian && <GuardianForm family={family} onClose={() => setEditGuardian(false)} onSaved={() => { setEditGuardian(false); load(); }} />}
      {addChild && <ChildForm familyId={family.id} onClose={() => setAddChild(false)} onSaved={() => { setAddChild(false); load(); }} />}
    </div>
  );
}

function WaiverStatus({ family }: { family: Guardian }) {
  const [show, setShow] = useState(false);
  const when = family.waiverAcceptedAt ? new Date(family.waiverAcceptedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "";
  return (
    <div>
      <p className="text-sm text-ink/70">
        <span className="mr-1 rounded-full bg-teal-light px-2 py-0.5 text-xs font-semibold text-teal-dark">Waiver signed</span>
        {when}{family.waiverVersion ? ` · v${family.waiverVersion}` : ""}
        {family.waiverSignature && (
          <button className="ml-2 text-xs font-medium text-teal hover:underline" onClick={() => setShow((v) => !v)}>{show ? "Hide" : "View"} signature</button>
        )}
      </p>
      {show && family.waiverSignature && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={family.waiverSignature} alt="Parent signature" className="mt-2 h-28 rounded-lg border border-line bg-white" />
      )}
    </div>
  );
}

function ChildCard({ child, onChange, onNotice, onError }: { child: ChildFull; onChange: () => void; onNotice: (s: string) => void; onError: (s: string) => void }) {
  const [edit, setEdit] = useState(false);
  const [book, setBook] = useState(false);
  const [busy, setBusy] = useState(false);

  async function checkIn() {
    setBusy(true);
    try {
      await api.post("/attendance/drop-in", { childId: child.id });
      onNotice(`${child.firstName} checked in.`);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn't check in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-ink">{child.firstName} {child.lastName}{child.age != null ? <span className="ml-2 text-sm font-normal text-ink/50">age {child.age}</span> : null}</p>
          {child.medicalNotes ? <p className="mt-1 rounded-md bg-coral/10 px-2 py-1 text-xs font-medium text-coral">⚕ {child.medicalNotes}</p> : <p className="mt-1 text-xs text-ink/40">No medical requirements listed</p>}
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-ink/40">Emergency contacts</p>
          {child.emergencyContacts.map((e, i) => (
            <p key={i} className="text-sm text-ink/70">{e.name}{e.relationship ? ` (${e.relationship})` : ""} · {e.phone}{e.canPickup ? "" : " · not authorised to collect"}</p>
          ))}
        </div>
        <div className="flex flex-col items-end gap-1">
          <button className="btn px-3 py-1.5 text-xs" disabled={busy} onClick={checkIn}>Check in now</button>
          <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setBook((v) => !v)}>Book…</button>
          <button className="text-xs font-medium text-teal" onClick={() => setEdit(true)}>Edit</button>
        </div>
      </div>
      {book && <BookForm child={child} onClose={() => setBook(false)} onBooked={() => { setBook(false); onNotice(`Booked ${child.firstName}.`); }} onError={onError} />}
      {edit && <ChildForm child={child} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); onChange(); }} />}
    </div>
  );
}

function BookForm({ child, onClose, onBooked, onError }: { child: ChildFull; onClose: () => void; onBooked: () => void; onError: (s: string) => void }) {
  const today = new Date().toLocaleDateString("en-CA");
  const [date, setDate] = useState(today);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("11:00");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const startAt = new Date(`${date}T${start}:00`);
      const endAt = new Date(`${date}T${end}:00`);
      await api.post("/attendance/book", { childId: child.id, startAt: startAt.toISOString(), endAt: endAt.toISOString() });
      onBooked();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn't book.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg bg-sand p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div><label className="label">Date</label><input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><label className="label">From</label><input type="time" className="field" value={start} onChange={(e) => setStart(e.target.value)} /></div>
        <div><label className="label">To</label><input type="time" className="field" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
        <button className="btn" disabled={busy} onClick={submit}>{busy ? "…" : "Book"}</button>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

const nowYear = new Date().getFullYear();

function GuardianForm({ family, onClose, onSaved }: { family: Guardian; onClose: () => void; onSaved: () => void }) {
  const [g, setG] = useState({
    firstName: family.firstName, lastName: family.lastName, relationship: family.relationship ?? "mother",
    phone: family.phone, email: family.email ?? "", addressLine: family.addressLine ?? "", suburb: family.suburb ?? "", postcode: family.postcode ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    setBusy(true); setErr(null);
    try {
      await api.patch(`/families/${family.id}`, { ...g, email: g.email || undefined, addressLine: g.addressLine || undefined, suburb: g.suburb || undefined, postcode: g.postcode || undefined, relationship: g.relationship || undefined });
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't save."); setBusy(false); }
  }
  return (
    <Modal onClose={onClose} title="Parent details">
      <div className="grid grid-cols-2 gap-2">
        <input className="field" placeholder="First name" value={g.firstName} onChange={(e) => setG({ ...g, firstName: e.target.value })} />
        <input className="field" placeholder="Last name" value={g.lastName} onChange={(e) => setG({ ...g, lastName: e.target.value })} />
        <select className="field" value={g.relationship} onChange={(e) => setG({ ...g, relationship: e.target.value })}>{["mother", "father", "guardian", "carer"].map((r) => <option key={r}>{r}</option>)}</select>
        <input className="field" placeholder="Phone" value={g.phone} onChange={(e) => setG({ ...g, phone: e.target.value })} />
        <input className="field col-span-2" placeholder="Email" value={g.email} onChange={(e) => setG({ ...g, email: e.target.value })} />
        <input className="field col-span-2" placeholder="Street address" value={g.addressLine} onChange={(e) => setG({ ...g, addressLine: e.target.value })} />
        <input className="field" placeholder="Suburb" value={g.suburb} onChange={(e) => setG({ ...g, suburb: e.target.value })} />
        <input className="field" placeholder="Postcode" value={g.postcode} onChange={(e) => setG({ ...g, postcode: e.target.value })} />
      </div>
      {err && <p className="mt-3 text-sm text-coral">{err}</p>}
      <FormButtons onClose={onClose} onSave={save} busy={busy} />
    </Modal>
  );
}

function ChildForm({ familyId, child, onClose, onSaved }: { familyId?: string; child?: ChildFull; onClose: () => void; onSaved: () => void }) {
  const [c, setC] = useState({
    firstName: child?.firstName ?? "", lastName: child?.lastName ?? "",
    birthMonth: child?.birthMonth ? String(child.birthMonth) : "", birthYear: child?.birthYear ? String(child.birthYear) : "",
    medicalNotes: child?.medicalNotes ?? "",
  });
  const [contacts, setContacts] = useState<EmergencyContact[]>(child?.emergencyContacts?.length ? child.emergencyContacts : [{ name: "", relationship: "", phone: "", canPickup: true }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    const valid = contacts.filter((x) => x.name.trim() && x.phone.trim());
    if (!c.firstName || !c.lastName) return setErr("Child name is required.");
    if (valid.length === 0) return setErr("At least one emergency contact (name + phone).");
    setBusy(true); setErr(null);
    const payload = {
      firstName: c.firstName, lastName: c.lastName,
      birthMonth: c.birthMonth ? Number(c.birthMonth) : undefined,
      birthYear: c.birthYear ? Number(c.birthYear) : undefined,
      medicalNotes: c.medicalNotes,
      emergencyContacts: valid.map((x) => ({ name: x.name, relationship: x.relationship || undefined, phone: x.phone, canPickup: x.canPickup })),
    };
    try {
      if (child) await api.patch(`/children/${child.id}`, payload);
      else await api.post(`/families/${familyId}/children`, payload);
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't save."); setBusy(false); }
  }

  return (
    <Modal onClose={onClose} title={child ? "Edit child" : "Add child"}>
      <div className="grid grid-cols-2 gap-2">
        <input className="field" placeholder="First name" value={c.firstName} onChange={(e) => setC({ ...c, firstName: e.target.value })} />
        <input className="field" placeholder="Last name" value={c.lastName} onChange={(e) => setC({ ...c, lastName: e.target.value })} />
        <input className="field" placeholder="Birth month (1-12)" inputMode="numeric" value={c.birthMonth} onChange={(e) => setC({ ...c, birthMonth: e.target.value.replace(/\D/g, "") })} />
        <input className="field" placeholder={`Birth year (e.g. ${nowYear - 4})`} inputMode="numeric" value={c.birthYear} onChange={(e) => setC({ ...c, birthYear: e.target.value.replace(/\D/g, "") })} />
        <textarea className="field col-span-2" rows={2} placeholder="Allergies & medical requirements" value={c.medicalNotes} onChange={(e) => setC({ ...c, medicalNotes: e.target.value })} />
      </div>
      <p className="label mt-3">Emergency contacts</p>
      <div className="space-y-2">
        {contacts.map((x, i) => (
          <div key={i} className="grid grid-cols-12 gap-2">
            <input className="field col-span-4" placeholder="Name" value={x.name} onChange={(e) => setContacts(contacts.map((y, j) => j === i ? { ...y, name: e.target.value } : y))} />
            <input className="field col-span-3" placeholder="Relationship" value={x.relationship ?? ""} onChange={(e) => setContacts(contacts.map((y, j) => j === i ? { ...y, relationship: e.target.value } : y))} />
            <input className="field col-span-3" placeholder="Phone" value={x.phone} onChange={(e) => setContacts(contacts.map((y, j) => j === i ? { ...y, phone: e.target.value } : y))} />
            <label className="col-span-2 flex items-center gap-1 text-xs text-ink/60"><input type="checkbox" checked={x.canPickup} onChange={(e) => setContacts(contacts.map((y, j) => j === i ? { ...y, canPickup: e.target.checked } : y))} /> pickup</label>
          </div>
        ))}
      </div>
      <button className="mt-2 text-sm font-medium text-teal" onClick={() => setContacts([...contacts, { name: "", relationship: "", phone: "", canPickup: true }])}>+ Add contact</button>
      {err && <p className="mt-3 text-sm text-coral">{err}</p>}
      <FormButtons onClose={onClose} onSave={save} busy={busy} />
    </Modal>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30" onClick={onClose}>
      <div className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 font-display text-lg font-bold text-ink">{title}</h2>
        {children}
      </div>
    </div>
  );
}
function FormButtons({ onClose, onSave, busy }: { onClose: () => void; onSave: () => void; busy: boolean }) {
  return (
    <div className="mt-auto flex gap-2 pt-5">
      <button className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
      <button className="btn flex-1" onClick={onSave} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
    </div>
  );
}

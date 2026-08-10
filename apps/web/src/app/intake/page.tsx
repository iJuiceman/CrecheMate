"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { isAuPhone } from "@/lib/phone";
import SignaturePad from "./SignaturePad";

const field =
  "w-full rounded-xl border border-line bg-white px-4 py-3 text-base text-ink placeholder:text-ink/40 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/40";
const labelCls = "mb-1.5 block text-sm font-semibold text-ink/70";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const RELATIONSHIPS = ["Mother", "Father", "Guardian", "Grandparent", "Carer", "Other"];

interface Info {
  facilityName: string;
  waiverText: string;
  waiverVersion: number;
  yearRange: { from: number; to: number };
}
interface Contact { name: string; relationship: string; phone: string; canPickup: boolean }

const emptyForm = () => ({
  guardian: { firstName: "", lastName: "", relationship: "", phone: "", email: "" },
  child: { firstName: "", lastName: "", birthMonth: "", birthYear: "", medicalNotes: "" },
  contacts: [{ name: "", relationship: "", phone: "", canPickup: true }] as Contact[],
});

export default function IntakePage() {
  const [info, setInfo] = useState<Info | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [accepted, setAccepted] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    api.get<Info>("/intake/info").then(setInfo).catch(() => setError("Couldn't load the registration form. Ask a staff member for help."));
  }, []);

  const g = form.guardian;
  const c = form.child;
  const setG = (patch: Partial<typeof g>) => setForm((f) => ({ ...f, guardian: { ...f.guardian, ...patch } }));
  const setC = (patch: Partial<typeof c>) => setForm((f) => ({ ...f, child: { ...f.child, ...patch } }));
  const setContact = (i: number, patch: Partial<Contact>) =>
    setForm((f) => ({ ...f, contacts: f.contacts.map((ct, j) => (j === i ? { ...ct, ...patch } : ct)) }));
  const addContact = () => setForm((f) => ({ ...f, contacts: [...f.contacts, { name: "", relationship: "", phone: "", canPickup: true }] }));
  const removeContact = (i: number) => setForm((f) => ({ ...f, contacts: f.contacts.filter((_, j) => j !== i) }));

  const contactsValid = form.contacts.every((ct) => ct.name.trim() && isAuPhone(ct.phone));
  const valid =
    g.firstName.trim() && g.lastName.trim() && isAuPhone(g.phone) &&
    c.firstName.trim() && c.lastName.trim() && c.birthMonth && c.birthYear &&
    contactsValid && accepted && !!signature;

  async function submit() {
    if (!valid || !signature) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ ok: boolean; childFirstName: string }>("/intake", {
        guardian: {
          firstName: g.firstName.trim(),
          lastName: g.lastName.trim(),
          relationship: g.relationship || undefined,
          phone: g.phone.trim(),
          email: g.email.trim() || undefined,
        },
        child: {
          firstName: c.firstName.trim(),
          lastName: c.lastName.trim(),
          birthMonth: Number(c.birthMonth),
          birthYear: Number(c.birthYear),
          medicalNotes: c.medicalNotes.trim() || undefined,
          emergencyContacts: form.contacts.map((ct) => ({
            name: ct.name.trim(),
            relationship: ct.relationship || undefined,
            phone: ct.phone.trim(),
            canPickup: ct.canPickup,
          })),
        },
        waiverAccepted: accepted,
        waiverSignature: signature,
      });
      setDone(res.childFirstName || c.firstName);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again or ask a staff member.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setForm(emptyForm());
    setAccepted(false);
    setSignature(null);
    setError(null);
    setDone(null);
    window.scrollTo(0, 0);
  }

  if (done !== null) {
    return (
      <div className="grid min-h-screen place-items-center bg-sand px-6">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-3xl bg-teal-light text-4xl">🎉</div>
          <h1 className="font-display text-3xl font-bold text-ink">All done!</h1>
          <p className="mt-3 text-lg text-ink/70">
            Thanks — {done ? <b>{done}</b> : "your child"} is registered. Please hand the iPad back to a staff member.
          </p>
          <button className="btn mt-8 px-6 py-3 text-base" onClick={reset}>Register another family</button>
        </div>
      </div>
    );
  }

  if (!info) {
    return <div className="grid min-h-screen place-items-center bg-sand text-sm text-ink/50">{error ?? "Loading…"}</div>;
  }

  const years: number[] = [];
  for (let y = info.yearRange.to; y >= info.yearRange.from; y--) years.push(y);

  return (
    <div className="min-h-screen bg-sand px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-teal text-2xl">🧸</div>
          <h1 className="font-display text-3xl font-bold text-ink">{info.facilityName} — Family registration</h1>
          <p className="mt-1 text-ink/60">Please fill in your details, then read and sign the agreement.</p>
        </header>

        {/* Parent / guardian */}
        <Section title="Your details" subtitle="The parent or guardian registering the child">
          <div className="grid gap-4 sm:grid-cols-2">
            <Labeled label="First name" required>
              <input className={field} value={g.firstName} onChange={(e) => setG({ firstName: e.target.value })} />
            </Labeled>
            <Labeled label="Last name" required>
              <input className={field} value={g.lastName} onChange={(e) => setG({ lastName: e.target.value })} />
            </Labeled>
            <Labeled label="Relationship to child">
              <select className={field} value={g.relationship} onChange={(e) => setG({ relationship: e.target.value })}>
                <option value="">Select…</option>
                {RELATIONSHIPS.map((r) => <option key={r} value={r.toLowerCase()}>{r}</option>)}
              </select>
            </Labeled>
            <Labeled label="Mobile / phone" required error={g.phone.length > 0 && !isAuPhone(g.phone) ? "Enter a valid Australian number" : undefined}>
              <input className={field} inputMode="tel" placeholder="0400 123 456" value={g.phone} onChange={(e) => setG({ phone: e.target.value })} />
            </Labeled>
            <Labeled label="Email (optional)" className="sm:col-span-2">
              <input className={field} inputMode="email" placeholder="you@example.com" value={g.email} onChange={(e) => setG({ email: e.target.value })} />
            </Labeled>
          </div>
        </Section>

        {/* Child */}
        <Section title="Child's details">
          <div className="grid gap-4 sm:grid-cols-2">
            <Labeled label="First name" required>
              <input className={field} value={c.firstName} onChange={(e) => setC({ firstName: e.target.value })} />
            </Labeled>
            <Labeled label="Last name" required>
              <input className={field} value={c.lastName} onChange={(e) => setC({ lastName: e.target.value })} />
            </Labeled>
            <Labeled label="Birth month" required>
              <select className={field} value={c.birthMonth} onChange={(e) => setC({ birthMonth: e.target.value })}>
                <option value="">Select…</option>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </Labeled>
            <Labeled label="Birth year" required>
              <select className={field} value={c.birthYear} onChange={(e) => setC({ birthYear: e.target.value })}>
                <option value="">Select…</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </Labeled>
            <Labeled label="Allergies / medical needs (optional)" className="sm:col-span-2">
              <textarea className={field} rows={3} placeholder="e.g. Peanut allergy — EpiPen in bag" value={c.medicalNotes} onChange={(e) => setC({ medicalNotes: e.target.value })} />
            </Labeled>
          </div>
        </Section>

        {/* Emergency contacts */}
        <Section title="Emergency contacts" subtitle="People we can call, and who may collect the child">
          <div className="space-y-4">
            {form.contacts.map((ct, i) => (
              <div key={i} className="rounded-xl border border-line bg-sand/50 p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Labeled label="Name" required>
                    <input className={field} value={ct.name} onChange={(e) => setContact(i, { name: e.target.value })} />
                  </Labeled>
                  <Labeled label="Relationship">
                    <input className={field} placeholder="e.g. Grandmother" value={ct.relationship} onChange={(e) => setContact(i, { relationship: e.target.value })} />
                  </Labeled>
                  <Labeled label="Phone" required error={ct.phone.length > 0 && !isAuPhone(ct.phone) ? "Enter a valid Australian number" : undefined}>
                    <input className={field} inputMode="tel" placeholder="0400 123 456" value={ct.phone} onChange={(e) => setContact(i, { phone: e.target.value })} />
                  </Labeled>
                  <label className="flex items-center gap-3 sm:col-span-2">
                    <input type="checkbox" className="h-5 w-5 rounded border-line text-teal focus:ring-teal" checked={ct.canPickup} onChange={(e) => setContact(i, { canPickup: e.target.checked })} />
                    <span className="text-base text-ink/80">Authorised to collect the child</span>
                  </label>
                </div>
                {form.contacts.length > 1 && (
                  <button type="button" className="mt-3 text-sm font-medium text-ink/50 hover:text-coral" onClick={() => removeContact(i)}>Remove this contact</button>
                )}
              </div>
            ))}
            <button type="button" className="btn-secondary" onClick={addContact}>+ Add another contact</button>
          </div>
        </Section>

        {/* Waiver + signature */}
        <Section title="Agreement & waiver" subtitle="Please read carefully">
          <div className="max-h-72 overflow-y-auto whitespace-pre-line rounded-xl border border-line bg-sand/60 p-4 text-sm leading-relaxed text-ink/80">
            {info.waiverText}
          </div>
          <label className="mt-4 flex items-start gap-3">
            <input type="checkbox" className="mt-1 h-5 w-5 rounded border-line text-teal focus:ring-teal" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
            <span className="text-base text-ink/80">I have read and accept this agreement, and I am the parent or legal guardian of the child named above.</span>
          </label>
          <div className="mt-5">
            <p className={labelCls}>Signature</p>
            <SignaturePad onChange={setSignature} />
          </div>
        </Section>

        {error && <p className="mb-4 rounded-xl bg-coral/10 px-4 py-3 text-sm text-coral">{error}</p>}

        <button className="btn w-full px-6 py-4 text-lg" disabled={!valid || busy} onClick={submit}>
          {busy ? "Submitting…" : "Submit registration"}
        </button>
        {!valid && <p className="mt-2 text-center text-sm text-ink/40">Complete every required field, accept the agreement, and sign to continue.</p>}
        <p className="mt-6 text-center text-xs text-ink/40">Your information is stored securely and used only to care for your child.</p>
      </div>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 rounded-card border border-line bg-white p-5 sm:p-6">
      <h2 className="font-display text-xl font-bold text-ink">{title}</h2>
      {subtitle && <p className="mb-4 mt-0.5 text-sm text-ink/55">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </section>
  );
}

function Labeled({ label, required, error, className, children }: { label: string; required?: boolean; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-sm font-semibold text-ink/70">
        {label}{required && <span className="text-coral"> *</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-coral">{error}</p>}
    </div>
  );
}

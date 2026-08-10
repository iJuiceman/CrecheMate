"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth, Staff } from "@/lib/auth";

export default function SetupPage() {
  const router = useRouter();
  const { setSession } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // If setup is already done, don't show this screen.
  useEffect(() => {
    api.get<{ needsSetup: boolean }>("/auth/setup-status").then((s) => {
      if (!s.needsSetup) router.replace("/login");
    });
  }, [router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ accessToken: string; user: Staff }>("/auth/register-first-admin", {
        firstName,
        lastName,
        email,
        password,
      });
      setSession(res.accessToken, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't complete setup.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-sand px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-teal text-2xl">🧸</div>
          <h1 className="font-display text-2xl font-bold text-ink">Welcome to CrecheMate</h1>
          <p className="mt-1 text-sm text-ink/60">Create the first administrator account to get started.</p>
        </div>
        <form onSubmit={submit} className="card space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">First name</label>
              <input className="field" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div>
              <label className="label">Last name</label>
              <input className="field" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label">Password (min 8 characters)</label>
            <input type="password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
          </div>
          {error && <p className="rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p>}
          <button className="btn w-full" disabled={busy}>
            {busy ? "Creating…" : "Create admin & continue"}
          </button>
        </form>
      </div>
    </div>
  );
}

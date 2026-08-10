"use client";

import { FormEvent, useState } from "react";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-sand px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-teal text-2xl">🧸</div>
          <h1 className="font-display text-2xl font-bold text-ink">CrecheMate</h1>
          <p className="mt-1 text-sm text-ink/60">Sign in to the front desk</p>
        </div>
        <form onSubmit={submit} className="card space-y-4">
          <div>
            <label className="label">Username</label>
            <input type="text" className="field" value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="username" autoCapitalize="none" spellCheck={false} />
          </div>
          <div>
            <label className="label">Password</label>
            <input type="password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          </div>
          {error && <p className="rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p>}
          <button className="btn w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-ink/50">
          Parents: <a href="/intake" className="font-medium text-teal hover:underline">register a child</a> or <a href="/book" className="font-medium text-teal hover:underline">book a session</a>
        </p>
      </div>
    </div>
  );
}

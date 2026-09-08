"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";

const NAV = [
  { href: "/dashboard", label: "Today's roster", icon: "🏠" },
  { href: "/families", label: "Families & children", icon: "👪" },
  { href: "/attendance", label: "Bookings", icon: "📅" },
  { href: "/roster", label: "Creche roster", icon: "🗓️" },
  { href: "/incidents", label: "Incidents", icon: "🩹" },
];
const ADMIN_NAV = [
  { href: "/reports", label: "Reports", icon: "📊" },
  { href: "/finance", label: "Finance", icon: "💰" },
  { href: "/staff", label: "Staff", icon: "🧑‍🏫" },
  { href: "/audit", label: "Audit log", icon: "🛡️" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [pendingRequests, setPendingRequests] = useState(0);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  // Live count of online booking requests awaiting confirmation.
  useEffect(() => {
    if (!user) return;
    const poll = () => api.get<{ count: number }>("/bookings/requests/count").then((r) => setPendingRequests(r.count)).catch(() => {});
    poll();
    const id = setInterval(poll, 20000);
    return () => clearInterval(id);
  }, [user]);

  if (loading || !user) {
    return <div className="grid min-h-screen place-items-center text-sm text-ink/50">Loading…</div>;
  }

  const items = user.role === "admin" ? [...NAV, ...ADMIN_NAV] : NAV;

  return (
    <div className="flex min-h-screen bg-sand">
      <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-white">
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal text-lg">🧸</span>
          <span className="font-display text-lg font-bold text-ink">CrecheMate</span>
        </div>
        <nav className="flex-1 space-y-1 px-2">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active ? "bg-teal-light text-teal-dark" : "text-ink/70 hover:bg-sand"
                }`}
              >
                <span>{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {item.href === "/attendance" && pendingRequests > 0 && (
                  <span className="rounded-full bg-coral px-1.5 py-0.5 text-xs font-semibold text-white">{pendingRequests}</span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-line p-3">
          <p className="px-1 text-sm font-medium text-ink">{user.firstName} {user.lastName}</p>
          <p className="px-1 text-xs capitalize text-ink/50">{user.role}</p>
          <button onClick={() => setShowPassword(true)} className="mt-2 w-full rounded-lg px-1 py-1.5 text-left text-sm text-ink/60 hover:text-teal-dark">
            Change password
          </button>
          <button onClick={logout} className="w-full rounded-lg px-1 py-1.5 text-left text-sm text-ink/60 hover:text-coral">
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">{children}</main>
      {showPassword && <ChangePasswordModal onClose={() => setShowPassword(false)} />}
    </div>
  );
}

// Self-service password change — the only path where a staff member ends up
// holding a credential their admin doesn't know (admin resets hand out a
// password the admin has seen).
function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function save() {
    if (next.length < 8) return setErr("The new password must be at least 8 characters.");
    if (next !== confirm) return setErr("The new passwords don't match.");
    setBusy(true); setErr(null);
    try {
      await api.post("/auth/change-password", { currentPassword: current, newPassword: next });
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't change the password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-card bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-lg font-bold text-ink">Change password</h2>
        {done ? (
          <>
            <p className="mt-3 rounded-lg bg-teal-light px-3 py-2 text-sm text-teal-dark">Password changed. Use it next time you sign in.</p>
            <button className="btn mt-4 w-full" onClick={onClose}>Done</button>
          </>
        ) : (
          <>
            <div className="mt-3 space-y-2">
              <div><label className="label">Current password</label><input type="password" className="field" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
              <div><label className="label">New password (8+ characters)</label><input type="password" className="field" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></div>
              <div><label className="label">Repeat new password</label><input type="password" className="field" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
            </div>
            {err && <p className="mt-3 text-sm text-coral">{err}</p>}
            <div className="mt-4 flex gap-2">
              <button className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
              <button className="btn flex-1" onClick={save} disabled={busy || !current || !next}>{busy ? "Saving…" : "Change password"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

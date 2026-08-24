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
          <button onClick={logout} className="mt-2 w-full rounded-lg px-1 py-1.5 text-left text-sm text-ink/60 hover:text-coral">
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

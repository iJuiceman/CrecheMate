"use client";

import { useEffect, useState } from "react";

// Facility-timezone date helpers. The API reasons in the facility's IANA zone;
// the browser may be anywhere (an interstate admin, a laptop that travelled).
// Deriving "today"/date-keys from the browser zone silently shifted roster
// days, report ranges and calendar highlights by a day.

/** The facility-local YYYY-MM-DD key for an instant. */
export function dateKeyInTz(d: Date | string, tz: string): string {
  return new Date(d).toLocaleDateString("en-CA", { timeZone: tz });
}

/** Facility-local wall-clock minutes since midnight for an instant. */
export function minutesInTz(d: Date | string, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: tz,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(d));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return (get("hour") % 24) * 60 + get("minute");
}

/** Pure date arithmetic on a YYYY-MM-DD key — timezone-free, so week
 * navigation can never land on the wrong weekday across a DST change. */
export function addDaysKey(key: string, days: number): string {
  const t = Date.parse(`${key}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** The Monday of the week containing a YYYY-MM-DD key. */
export function mondayKeyOf(key: string): string {
  const dow = new Date(`${key}T00:00:00Z`).getUTCDay(); // Sun=0
  return addDaysKey(key, -((dow + 6) % 7));
}

/** Display label for a date key (parsed at UTC noon so no boundary slips). */
export function keyLabel(key: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-AU", { ...opts, timeZone: "UTC" });
}

// Module-cached facility timezone, from the public booking config.
let cachedTz: string | null = null;
let inflight: Promise<string> | null = null;
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

async function fetchTz(): Promise<string> {
  try {
    const res = await fetch(`${API_URL}/bookings/config`);
    const data = await res.json();
    if (typeof data?.timezone === "string" && data.timezone) return data.timezone;
  } catch { /* fall through */ }
  return Intl.DateTimeFormat().resolvedOptions().timeZone; // best effort
}

/** The facility timezone (null until loaded; falls back to the browser's). */
export function useFacilityTz(): string | null {
  const [tz, setTz] = useState<string | null>(cachedTz);
  useEffect(() => {
    if (cachedTz) return;
    (inflight ??= fetchTz().then((t) => (cachedTz = t))).then(setTz);
  }, []);
  return tz;
}

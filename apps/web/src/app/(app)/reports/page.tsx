"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { money } from "@/lib/types";
import { downloadCsv, dollars } from "@/lib/csv";
import { CATEGORICAL, HBars, StackedDayBars, TrendBars } from "./charts";

type Tab = "summary" | "financial" | "attendance" | "families" | "bookings";
const TABS: { key: Tab; label: string }[] = [
  { key: "summary", label: "Summary" },
  { key: "financial", label: "Financial" },
  { key: "attendance", label: "Attendance" },
  { key: "families", label: "Families" },
  { key: "bookings", label: "Bookings & staff" },
];

const isoDaysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-CA");
};
const today = () => new Date().toLocaleDateString("en-CA");
const dayLabel = (iso: string) => `${+iso.slice(8, 10)}/${+iso.slice(5, 7)}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("summary");
  const [from, setFrom] = useState(isoDaysAgo(29));
  const [to, setTo] = useState(today());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.get<any>(`/reports/${tab}?from=${from}&to=${to}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load the report."))
      .finally(() => setLoading(false));
  }, [tab, from, to]);
  useEffect(load, [load]);

  function preset(days: number) { setFrom(isoDaysAgo(days - 1)); setTo(today()); }
  function thisMonth() {
    const d = new Date();
    setFrom(new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString("en-CA"));
    setTo(today());
  }

  return (
    <div className="p-6">
      <h1 className="font-display text-2xl font-bold text-ink">Reports</h1>
      <p className="mt-1 text-sm text-ink/60">Financials, attendance, families and online bookings for any date range.</p>

      {/* Date range */}
      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-card border border-line bg-white p-3">
        <div><label className="label">From</label><input type="date" className="field" max={to} value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="label">To</label><input type="date" className="field" min={from} max={today()} value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div className="flex gap-1.5">
          {[["7d", 7], ["30d", 30], ["90d", 90]].map(([l, n]) => (
            <button key={l as string} className="btn-secondary px-3 py-1.5 text-xs" onClick={() => preset(n as number)}>{l}</button>
          ))}
          <button className="btn-secondary px-3 py-1.5 text-xs" onClick={thisMonth}>This month</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-4 flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? "border-teal text-teal-dark" : "border-transparent text-ink/50 hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p>}
      {loading ? (
        <p className="mt-8 text-center text-sm text-ink/40">Loading…</p>
      ) : data ? (
        <div className="mt-5">
          {tab === "summary" && <Summary d={data} />}
          {tab === "financial" && <Financial d={data} />}
          {tab === "attendance" && <Attendance d={data} />}
          {tab === "families" && <Families d={data} />}
          {tab === "bookings" && <Bookings d={data} />}
        </div>
      ) : null}
    </div>
  );
}

// ── Shared bits ─────────────────────────────────────────────────────────────
function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "coral" | "teal" }) {
  return (
    <div className="card">
      <p className="label">{label}</p>
      <p className={`font-display text-2xl font-bold ${tone === "coral" ? "text-coral" : tone === "teal" ? "text-teal-dark" : "text-ink"}`}>{value}</p>
      {sub && <p className="text-xs text-ink/50">{sub}</p>}
    </div>
  );
}
function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-base font-bold text-ink">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}
function ExportBtn({ onClick }: { onClick: () => void }) {
  return <button className="btn-secondary px-3 py-1.5 text-xs" onClick={onClick}>Export CSV</button>;
}
function Table({ cols, rows }: { cols: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink/50">
            {cols.map((c) => <th key={c} className="py-2 pr-4 font-semibold">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line/60">
              {r.map((v, j) => <td key={j} className="py-1.5 pr-4 text-ink/80 tabular-nums">{v}</td>)}
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={cols.length} className="py-6 text-center text-ink/40">Nothing in this range.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
const rangeName = (d: any) => `${d.range.from}_to_${d.range.to}`;

// ── Summary ─────────────────────────────────────────────────────────────────
function Summary({ d }: { d: any }) {
  const k = d.kpis;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Collected" value={money(k.collectedCents)} sub="paid in period" tone="teal" />
        <Kpi label="Outstanding" value={money(k.outstandingCents)} sub="unpaid checkouts" tone={k.outstandingCents > 0 ? "coral" : undefined} />
        <Kpi label="Sessions" value={String(k.sessions)} sub={`${k.preBooked} booked · ${k.dropIns} drop-in`} />
        <Kpi label="Hours in care" value={String(k.hours)} sub={`avg peak vs ${k.capacity} cap`} />
        <Kpi label="No-shows" value={String(k.noShows)} tone={k.noShows > 0 ? "coral" : undefined} />
        <Kpi label="Peak occupancy" value={`${k.peakOccupancy}/${k.capacity}`} sub="busiest moment" />
        <Kpi label="New families" value={String(k.newFamilies)} />
        <Kpi label="Online requests" value={String(k.onlineRequests)} sub={`${money(k.refundedCents)} refunded`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Revenue collected per day">
          <TrendBars data={d.revenueByDay.map((r: any) => ({ label: dayLabel(r.date), value: r.collected, hover: `${r.date}: ${money(r.collected)}` }))} format={(n) => "$" + Math.round(n / 100)} />
        </Panel>
        <Panel title="Occupancy vs capacity">
          <TrendBars data={d.occupancyByDay.map((r: any) => ({ label: dayLabel(r.date), value: r.peak, hover: `${r.date}: peak ${r.peak}/${r.capacity}` }))} refLine={k.capacity} refLabel={`capacity ${k.capacity}`} />
        </Panel>
        <Panel title="Sessions per day">
          <StackedDayBars data={d.sessionsByDay.map((r: any) => ({ label: dayLabel(r.date), values: [r.booked, r.dropIn] }))} series={[{ label: "Booked", color: CATEGORICAL[0] }, { label: "Drop-in", color: CATEGORICAL[1] }]} />
        </Panel>
        <Panel title="Payment mix (collected)">
          <HBars data={d.paymentMix.map((m: any) => ({ label: cap(m.method), value: m.cents }))} colors={CATEGORICAL} format={(n) => money(n)} />
        </Panel>
      </div>
    </div>
  );
}

// ── Financial ────────────────────────────────────────────────────────────────
function Financial({ d }: { d: any }) {
  const t = d.totals;
  const exportRows = () => downloadCsv(`financial_${rangeName(d)}.csv`, d.rows.map((r: any) => ({
    Date: r.date, Child: r.child, Court: r.court, Hours: r.hours, Fee: dollars(r.feeCents),
    Status: r.status, Payment: r.paymentStatus, Method: r.method, "Paid on": r.paidAt,
  })));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Collected" value={money(t.collectedCents)} tone="teal" />
        <Kpi label="Outstanding" value={money(t.outstandingCents)} tone={t.outstandingCents > 0 ? "coral" : undefined} />
        <Kpi label="Waived" value={money(t.waivedCents)} />
        <Kpi label="Refunded" value={money(t.refundedCents)} sub={`net ${money(t.netCents)}`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Collected vs outstanding per day">
          <StackedDayBars data={d.byDay.map((r: any) => ({ label: dayLabel(r.date), values: [r.collected, r.outstanding] }))} series={[{ label: "Collected", color: CATEGORICAL[2] }, { label: "Outstanding", color: "#e11d48" }]} />
        </Panel>
        <Panel title="By payment method">
          <HBars data={d.byMethod.map((m: any) => ({ label: cap(m.method), value: m.cents }))} colors={CATEGORICAL} format={(n) => money(n)} />
        </Panel>
      </div>
      <Panel title="Fee detail" action={<ExportBtn onClick={exportRows} />}>
        <Table
          cols={["Date", "Child", "Court", "Hours", "Fee", "Status", "Payment", "Method"]}
          rows={d.rows.map((r: any) => [r.date, r.child, r.court, r.hours, money(r.feeCents), r.status.replace("_", " "), r.paymentStatus, r.method])}
        />
      </Panel>
    </div>
  );
}

// ── Attendance ────────────────────────────────────────────────────────────────
function Attendance({ d }: { d: any }) {
  const t = d.totals;
  const exportRows = () => downloadCsv(`attendance_${rangeName(d)}.csv`, d.rows.map((r: any) => ({
    Date: r.date, Child: r.child, Type: r.type, Court: r.court, "Check-in": r.checkIn, "Check-out": r.checkOut, Hours: r.hours, Status: r.status,
  })));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Sessions" value={String(t.sessions)} sub={`${t.preBooked} booked · ${t.dropIns} drop-in`} />
        <Kpi label="Hours in care" value={String(t.hours)} sub={`avg ${t.avgHours}h / session`} />
        <Kpi label="Peak occupancy" value={`${t.peakOccupancy}/${t.capacity}`} />
        <Kpi label="No-shows / cancelled" value={`${t.noShows} / ${t.cancelled}`} tone={t.noShows > 0 ? "coral" : undefined} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Sessions per day">
          <StackedDayBars data={d.byDay.map((r: any) => ({ label: dayLabel(r.date), values: [r.booked, r.dropIn] }))} series={[{ label: "Booked", color: CATEGORICAL[0] }, { label: "Drop-in", color: CATEGORICAL[1] }]} />
        </Panel>
        <Panel title="Occupancy vs capacity">
          <TrendBars data={d.occupancyByDay.map((r: any) => ({ label: dayLabel(r.date), value: r.peak, hover: `${r.date}: peak ${r.peak}/${r.capacity}` }))} refLine={t.capacity} refLabel={`capacity ${t.capacity}`} />
        </Panel>
        {d.byCourt.length > 0 && (
          <Panel title="Sessions by court">
            <HBars data={d.byCourt.map((c: any) => ({ label: c.court, value: c.sessions }))} />
          </Panel>
        )}
      </div>
      <Panel title="Attendance detail" action={<ExportBtn onClick={exportRows} />}>
        <Table
          cols={["Date", "Child", "Type", "Court", "In", "Out", "Hours", "Status"]}
          rows={d.rows.map((r: any) => [r.date, r.child, r.type, r.court, r.checkIn, r.checkOut, r.hours, r.status.replace("_", " ")])}
        />
      </Panel>
    </div>
  );
}

// ── Families ──────────────────────────────────────────────────────────────────
function Families({ d }: { d: any }) {
  const t = d.totals;
  const exportRows = () => downloadCsv(`families_${rangeName(d)}.csv`, d.rows.map((r: any) => ({
    Family: r.family, Phone: r.phone, Children: r.children, Waiver: r.waiver, Registered: r.registered,
  })));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Active families" value={String(t.activeFamilies)} />
        <Kpi label="Active children" value={String(t.activeChildren)} />
        <Kpi label="New families" value={String(t.newFamilies)} sub="in period" tone="teal" />
        <Kpi label="Waivers signed" value={`${t.waiverSigned}`} sub={`${t.waiverUnsigned} not signed`} tone={t.waiverUnsigned > 0 ? "coral" : undefined} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Children by age">
          <HBars data={d.childrenByAge.filter((a: any) => a.count > 0).map((a: any) => ({ label: a.bucket, value: a.count }))} />
        </Panel>
        <Panel title="New registrations per day">
          <TrendBars data={d.registrationsByDay.map((r: any) => ({ label: dayLabel(r.date), value: r.registrations, hover: `${r.date}: ${r.registrations}` }))} />
        </Panel>
        {d.courtUsage.length > 0 && (
          <Panel title="Court usage (sessions)">
            <HBars data={d.courtUsage.map((c: any) => ({ label: c.court, value: c.sessions }))} />
          </Panel>
        )}
      </div>
      <Panel title="Families" action={<ExportBtn onClick={exportRows} />}>
        <Table cols={["Family", "Phone", "Children", "Waiver", "Registered"]} rows={d.rows.map((r: any) => [r.family, r.phone, r.children, r.waiver, r.registered])} />
      </Panel>
    </div>
  );
}

// ── Bookings & staff ──────────────────────────────────────────────────────────
function Bookings({ d }: { d: any }) {
  const t = d.totals;
  const exportRows = () => downloadCsv(`online-bookings_${rangeName(d)}.csv`, d.requestRows.map((r: any) => ({
    Created: r.created, Child: r.child, Parent: r.parent, Session: r.session, Court: r.court, Fee: dollars(r.feeCents), Status: r.status, Payment: r.payment,
  })));
  const exportStaff = () => downloadCsv(`staff-activity_${rangeName(d)}.csv`, d.staffActivity.map((s: any) => ({ Staff: s.staff, "Check-ins": s.checkIns, "Check-outs": s.checkOuts })));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Requests" value={String(t.requests)} sub={`${t.confirmed} confirmed · ${t.declined} declined`} />
        <Kpi label="Pending" value={String(t.pending)} tone={t.pending > 0 ? "coral" : undefined} />
        <Kpi label="Prepaid" value={money(t.prepaidCents)} tone="teal" />
        <Kpi label="Refunded" value={money(t.refundedCents)} />
      </div>
      <Panel title="Online booking requests" action={<ExportBtn onClick={exportRows} />}>
        <Table
          cols={["Created", "Child", "Parent", "Session", "Court", "Fee", "Status", "Payment"]}
          rows={d.requestRows.map((r: any) => [r.created, r.child, r.parent, r.session, r.court, money(r.feeCents), r.status, r.payment])}
        />
      </Panel>
      <Panel title="Staff activity (check-ins / check-outs)" action={<ExportBtn onClick={exportStaff} />}>
        <Table cols={["Staff", "Check-ins", "Check-outs"]} rows={d.staffActivity.map((s: any) => [s.staff, s.checkIns, s.checkOuts])} />
      </Panel>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { FinanceSummary, money } from "@/lib/types";
import { downloadCsv, dollars } from "@/lib/csv";

const isoDaysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-CA");
};
const today = () => new Date().toLocaleDateString("en-CA");
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export default function FinancePage() {
  const [from, setFrom] = useState(isoDaysAgo(29));
  const [to, setTo] = useState(today());
  const [d, setD] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.get<FinanceSummary>(`/finance/summary?from=${from}&to=${to}`)
      .then(setD)
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load finance data."))
      .finally(() => setLoading(false));
  }, [from, to]);
  useEffect(load, [load]);

  function preset(days: number) { setFrom(isoDaysAgo(days - 1)); setTo(today()); }
  function thisMonth() {
    const now = new Date();
    setFrom(new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString("en-CA"));
    setTo(today());
  }
  function lastMonth() {
    const now = new Date();
    setFrom(new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString("en-CA"));
    setTo(new Date(now.getFullYear(), now.getMonth(), 0).toLocaleDateString("en-CA"));
  }

  async function fetchFile(path: string, filename: string, key: string) {
    setBusy(key); setError(null);
    try {
      await api.download(path, filename);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed.");
    } finally {
      setBusy(null);
    }
  }

  function transactionsCsv() {
    if (!d) return;
    downloadCsv(`transactions-${d.range.from}-to-${d.range.to}.csv`, [
      ...d.rows.map((t) => ({
        paid: t.paidDate, service: t.serviceDate, child: t.child, guardian: t.guardian,
        method: t.method, invoice: t.invoiceNumber, amount: dollars(t.amountCents),
      })),
      ...d.refunds.map((q) => ({
        paid: q.refundDate, service: "", child: q.child, guardian: q.parent,
        method: "refund", invoice: q.creditNumber, amount: `-${dollars(q.amountCents)}`,
      })),
    ]);
  }

  return (
    <div className="p-6">
      <h1 className="font-display text-2xl font-bold text-ink">Finance</h1>
      <p className="mt-1 text-sm text-ink/60">Money actually collected (cash basis, by payment date) — export to Xero, CSV or PDF.</p>

      {/* Date range */}
      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-card border border-line bg-white p-3">
        <div><label className="label">From</label><input type="date" className="field" max={to} value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="label">To</label><input type="date" className="field" min={from} max={today()} value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div className="flex gap-1.5">
          {[["7d", 7], ["30d", 30], ["90d", 90]].map(([l, n]) => (
            <button key={l as string} className="btn-secondary px-3 py-1.5 text-xs" onClick={() => preset(n as number)}>{l}</button>
          ))}
          <button className="btn-secondary px-3 py-1.5 text-xs" onClick={thisMonth}>This month</button>
          <button className="btn-secondary px-3 py-1.5 text-xs" onClick={lastMonth}>Last month</button>
        </div>
        <div className="ml-auto flex gap-2">
          <button className="btn-secondary text-xs" disabled={busy !== null || !d} onClick={() => d && fetchFile(`/finance/xero.csv?from=${from}&to=${to}`, `xero-sales-${d.range.from}-to-${d.range.to}.csv`, "xero")}>
            {busy === "xero" ? "Exporting…" : "⬇ Xero sales CSV"}
          </button>
          <button className="btn-secondary text-xs" disabled={!d} onClick={transactionsCsv}>⬇ Transactions CSV</button>
          <button className="btn text-xs" disabled={busy !== null || !d} onClick={() => d && fetchFile(`/finance/report.pdf?from=${from}&to=${to}`, `financial-report-${d.range.from}-to-${d.range.to}.pdf`, "pdf")}>
            {busy === "pdf" ? "Preparing…" : "⬇ PDF report"}
          </button>
        </div>
      </div>

      {error && <p className="mt-4 rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p>}
      {loading ? (
        <p className="mt-8 text-center text-sm text-ink/40">Loading…</p>
      ) : d ? (
        <div className="mt-5 space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Kpi label="Collected" value={money(d.totals.collectedCents)} tone="teal" />
            <Kpi label="Refunded" value={money(d.totals.refundedCents)} tone={d.totals.refundedCents ? "coral" : undefined} />
            <Kpi label="Net revenue" value={money(d.totals.netCents)} />
            <Kpi label="Outstanding" value={money(d.totals.outstandingCents)} sub="unpaid, sessions in range" tone={d.totals.outstandingCents ? "coral" : undefined} />
            <Kpi label="Waived" value={money(d.totals.waivedCents)} sub="sessions in range" />
          </div>

          {/* Xero note + method mix */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="card">
              <h3 className="font-display text-base font-bold text-ink">Xero export</h3>
              <p className="mt-1 text-sm text-ink/60">
                The Xero CSV matches Xero&apos;s sales-invoice import template. In Xero: <b>Business → Invoices → Import</b>, and choose <b>Tax&nbsp;Inclusive</b> when asked (fees are consumer prices).
                Lines are coded to account <b>{d.xero.accountCode}</b> as <b>{d.xero.taxType}</b> — change these in <Link href="/settings" className="font-medium text-teal hover:underline">Settings</Link>.
              </p>
              <p className="mt-2 text-xs text-ink/50">
                Invoice numbers ({d.xero.invoicePrefix}-…) are stable, so re-importing an overlapping range won&apos;t create duplicates — Xero skips invoice numbers it already has. Refunded online prepayments export as an invoice + credit-note pair that nets to zero.
              </p>
            </div>
            <div className="card">
              <h3 className="font-display text-base font-bold text-ink">Collected by method</h3>
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {d.byMethod.map((m) => (
                    <tr key={m.method} className="border-b border-line last:border-0">
                      <td className="py-1.5 text-ink/70">{cap(m.method)}</td>
                      <td className="py-1.5 text-right font-medium text-ink">{money(m.cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Transactions */}
          <div className="card">
            <h3 className="mb-2 font-display text-base font-bold text-ink">Transactions ({d.rows.length})</h3>
            {d.rows.length === 0 ? (
              <p className="text-sm text-ink/40">No payments in this range.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase text-ink/40">
                      <th className="py-1.5 pr-2 font-medium">Paid</th>
                      <th className="py-1.5 pr-2 font-medium">Service</th>
                      <th className="py-1.5 pr-2 font-medium">Child</th>
                      <th className="py-1.5 pr-2 font-medium">Guardian</th>
                      <th className="py-1.5 pr-2 font-medium">Method</th>
                      <th className="py-1.5 pr-2 font-medium">Invoice #</th>
                      <th className="py-1.5 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.rows.map((t) => (
                      <tr key={t.id} className="border-b border-line last:border-0">
                        <td className="py-1.5 pr-2 text-ink/70">{t.paidDate}</td>
                        <td className="py-1.5 pr-2 text-ink/70">{t.serviceDate}</td>
                        <td className="py-1.5 pr-2 text-ink">{t.child}</td>
                        <td className="py-1.5 pr-2 text-ink/70">{t.guardian}</td>
                        <td className="py-1.5 pr-2 text-ink/70">{cap(t.method)}</td>
                        <td className="py-1.5 pr-2 font-mono text-xs text-ink/60">{t.invoiceNumber}</td>
                        <td className="py-1.5 text-right font-medium text-ink">{money(t.amountCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Refunds */}
          {d.refunds.length > 0 && (
            <div className="card">
              <h3 className="mb-2 font-display text-base font-bold text-ink">Refunds — declined online bookings ({d.refunds.length})</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase text-ink/40">
                      <th className="py-1.5 pr-2 font-medium">Refunded</th>
                      <th className="py-1.5 pr-2 font-medium">Child</th>
                      <th className="py-1.5 pr-2 font-medium">Parent</th>
                      <th className="py-1.5 pr-2 font-medium">Credit #</th>
                      <th className="py-1.5 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.refunds.map((q) => (
                      <tr key={q.id} className="border-b border-line last:border-0">
                        <td className="py-1.5 pr-2 text-ink/70">{q.refundDate}</td>
                        <td className="py-1.5 pr-2 text-ink">{q.child}</td>
                        <td className="py-1.5 pr-2 text-ink/70">{q.parent}</td>
                        <td className="py-1.5 pr-2 font-mono text-xs text-ink/60">{q.creditNumber}</td>
                        <td className="py-1.5 text-right font-medium text-coral">-{money(q.amountCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "coral" | "teal" }) {
  return (
    <div className="card">
      <p className="label">{label}</p>
      <p className={`font-display text-2xl font-bold ${tone === "coral" ? "text-coral" : tone === "teal" ? "text-teal-dark" : "text-ink"}`}>{value}</p>
      {sub && <p className="text-xs text-ink/50">{sub}</p>}
    </div>
  );
}

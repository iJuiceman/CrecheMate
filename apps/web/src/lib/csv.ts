// Build a CSV from an array of flat objects and trigger a download. Keys of the
// first row become the header; values are escaped per RFC 4180.
export function downloadCsv(filename: string, rows: Record<string, string | number>[]) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const esc = (v: string | number) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map((r) => headers.map((h) => esc(r[h])).join(","));
  const csv = [headers.join(","), ...body].join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const dollars = (cents: number) => (cents / 100).toFixed(2);

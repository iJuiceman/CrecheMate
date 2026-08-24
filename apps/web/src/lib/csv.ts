// Escape a CSV cell against both malformed-CSV (RFC 4180) and spreadsheet
// formula injection (CWE-1236): names come from the public intake/booking
// forms, so a value like `=HYPERLINK(...)` must not execute when opened in
// Excel. A leading =,+,@,TAB,CR (and `-` when not a number) is prefixed with an
// apostrophe; numeric cells like `-30.00` are left intact. Mirrors
// apps/api/src/common/csv.util.ts.
export function escapeCsvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  const dangerous = /^[=+@\t\r]/.test(s) || (/^-/.test(s) && !/^-?\d/.test(s));
  const guarded = dangerous ? `'${s}` : s;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

// Build a CSV from an array of flat objects and trigger a download. Keys of the
// first row become the header; values are escaped per RFC 4180 + formula-guarded.
export function downloadCsv(filename: string, rows: Record<string, string | number>[]) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const body = rows.map((r) => headers.map((h) => escapeCsvCell(r[h])).join(","));
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

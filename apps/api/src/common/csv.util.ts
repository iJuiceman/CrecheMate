// CSV cell escaping that is safe against BOTH malformed-CSV (RFC 4180) and
// spreadsheet formula injection (CWE-1236). Names/descriptions in exports come
// from the public intake/booking forms, so a value like
// `=HYPERLINK("http://evil","open")` must never be evaluated when an admin
// opens the file in Excel/Sheets.
//
// A leading =, +, @, TAB or CR is the formula trigger; we prefix such cells
// with an apostrophe so the spreadsheet treats them as text. `-` is excluded
// when it introduces a number (e.g. a `-30.00` refund amount) so numeric
// columns stay numeric for Xero's importer.
export function escapeCsvCell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  const dangerous = /^[=+@\t\r]/.test(s) || (/^-/.test(s) && !/^-?\d/.test(s));
  const guarded = dangerous ? `'${s}` : s;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

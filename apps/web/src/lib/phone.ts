// Mirror of the API's Australian phone rule so the form can validate inline
// before submitting. Tolerant of spaces, dashes, parentheses and a +61 prefix.
export function isAuPhone(raw: string): boolean {
  const n = (raw ?? "").replace(/[\s()\-.]/g, "");
  return /^0[2-478]\d{8}$/.test(n) || /^\+?61[2-478]\d{8}$/.test(n);
}

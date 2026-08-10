/**
 * Current age in years from a child's birth month (1-12) + year. Computed on
 * read so it's always current and parents never have to update it. Null when
 * no birth info is on file.
 */
export function computeAge(birthMonth: number | null, birthYear: number | null): number | null {
  if (birthMonth == null || birthYear == null) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - birthYear;
  if (now.getUTCMonth() + 1 < birthMonth) age -= 1;
  return age < 0 || age > 25 ? null : age;
}

"use client";

// Court picker. When courts are configured (Settings → Courts) staff simply
// choose one from a dropdown — no typing. If none are configured yet it falls
// back to a text box so check-in is never blocked.
export default function CourtInput({
  value,
  onChange,
  courts,
  className,
  placeholder = "Select court…",
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  courts: string[];
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  if (courts.length === 0) {
    return (
      <input
        className={className ?? "field"}
        value={value}
        placeholder="e.g. Pickleball 1 (add your courts in Settings)"
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  // Keep showing a court that's no longer in the list (e.g. renamed/removed)
  // so an existing record still reads correctly.
  const options = value && !courts.includes(value) ? [value, ...courts] : courts;
  return (
    <select
      className={className ?? "field"}
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {options.map((c) => (
        <option key={c} value={c}>{c}</option>
      ))}
    </select>
  );
}

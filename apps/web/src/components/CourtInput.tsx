"use client";

import { useId } from "react";

// A court field: free text, but backed by a datalist of the club's configured
// courts so staff can pick quickly and consistently. Works with or without a
// configured list.
export default function CourtInput({
  value,
  onChange,
  courts,
  className,
  placeholder = "e.g. Court 3",
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  courts: string[];
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  return (
    <>
      <input
        className={className ?? "field"}
        list={courts.length ? id : undefined}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
      />
      {courts.length > 0 && (
        <datalist id={id}>
          {courts.map((c) => <option key={c} value={c} />)}
        </datalist>
      )}
    </>
  );
}

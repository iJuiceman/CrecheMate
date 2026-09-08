"use client";

import { useState } from "react";

// The relationship pick-list for emergency contacts: the same options as the
// parent forms plus grandparent, and an "Other…" that reveals a free-text
// field. The stored value is always a plain string (the option, or whatever
// was typed under Other).
export const RELATIONSHIPS = ["mother", "father", "guardian", "carer", "grandparent"] as const;

export default function RelationshipSelect({
  value,
  onChange,
  className = "field",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const known = (RELATIONSHIPS as readonly string[]).includes(value);
  // Derived + a sticky user override: rows in the contact forms are keyed by
  // index, so state initialised once went stale when a row above was deleted
  // (a surviving "Other" value silently vanished from the UI).
  const [forcedOther, setForcedOther] = useState(false);
  const otherMode = forcedOther || (!!value && !known);
  const setOtherMode = setForcedOther;

  return (
    <div className="flex flex-col gap-1">
      <select
        className={className}
        value={otherMode ? "__other" : known ? value : ""}
        onChange={(e) => {
          if (e.target.value === "__other") {
            setOtherMode(true);
            onChange("");
          } else {
            setOtherMode(false);
            onChange(e.target.value);
          }
        }}
      >
        <option value="">Relationship…</option>
        {RELATIONSHIPS.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
        <option value="__other">Other…</option>
      </select>
      {otherMode && (
        <input
          className={className}
          placeholder="e.g. aunt, neighbour"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
        />
      )}
    </div>
  );
}

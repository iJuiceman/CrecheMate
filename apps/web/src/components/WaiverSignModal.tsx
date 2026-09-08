"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import SignaturePad from "@/components/SignaturePad";

// Waivers are mandatory before care starts. When a parent hasn't accepted the
// current waiver, the desk hands them the screen: they read the waiver and
// sign with a finger, and the signature rides along with the check-in.
export default function WaiverSignModal({
  parentName,
  onClose,
  onSigned,
}: {
  parentName: string;
  onClose: () => void;
  onSigned: (signatureDataUrl: string) => void;
}) {
  const [waiverText, setWaiverText] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get<{ waiverText: string }>("/intake/info").then((i) => setWaiverText(i.waiverText)).catch(() => setWaiverText("(Couldn't load the waiver text — please try again.)"));
  }, []);

  // The signature is a legal acceptance of the TEXT — the button stays locked
  // until the parent has reached the end of it (or it fits without scrolling).
  useEffect(() => {
    if (waiverText == null) return;
    const el = textRef.current;
    if (el && el.scrollHeight <= el.clientHeight + 8) setScrolled(true);
  }, [waiverText]);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/40 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-card bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-lg font-bold text-ink">Waiver signature required</h2>
        <p className="mt-1 text-sm text-ink/60">
          <span className="font-medium text-ink">{parentName}</span> hasn&apos;t accepted the current waiver. Please hand them the screen to read and sign before check-in.
        </p>
        <div
          ref={textRef}
          className="mt-3 min-h-[8rem] flex-1 overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-sand p-3 text-xs leading-relaxed text-ink/80"
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setScrolled(true);
          }}
        >
          {waiverText ?? "Loading…"}
        </div>
        {!scrolled && <p className="mt-1 text-xs text-amber-700">Scroll to the end of the agreement to enable signing.</p>}
        <div className="mt-3">
          <p className="label">Parent&apos;s signature</p>
          <SignaturePad onChange={setSignature} />
        </div>
        <div className="mt-4 flex gap-2">
          <button className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
          <button
            className="btn flex-1 disabled:opacity-50"
            disabled={!signature || !scrolled}
            title={!scrolled ? "The parent reads the whole waiver, then signs above" : undefined}
            onClick={() => signature && scrolled && onSigned(signature)}
          >
            Accept &amp; check in
          </button>
        </div>
      </div>
    </div>
  );
}

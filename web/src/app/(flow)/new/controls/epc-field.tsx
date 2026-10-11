"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { EpcLadder } from "@/components/app/epc-ladder";
import { EPC_RANGES, sapInBand } from "@/lib/extract/epc";
import type { EpcBand } from "@/lib/twin/types";
import { cn } from "@/lib/utils";
import { buzz } from "./haptics";

const FIND_URL = "https://find-energy-certificate.service.gov.uk/";

/** The certificate ladder to tap, or "I don't know" (an estimate from the other answers fills in). */
export function EpcPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const unknown = value === "unknown";
  return (
    <div className="space-y-3">
      <EpcLadder band={unknown ? null : (value as EpcBand)} onSelect={onChange} size="lg" />
      <button
        aria-pressed={unknown}
        onClick={() => {
          buzz();
          onChange("unknown");
        }}
        className={cn("w-full rounded-2xl px-4 py-3 text-left ring-1 transition-colors", unknown ? "bg-volt/10 ring-volt" : "ring-hairline hover:bg-surface-2")}
      >
        <span className="block text-sm font-medium">I don&apos;t know</span>
        <span className="block text-xs text-muted-foreground">We&apos;ll estimate it from your answers</span>
      </button>
      <a href={FIND_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-volt underline-offset-4 hover:underline">
        Find your EPC rating <ExternalLink className="size-3.5" />
      </a>
    </div>
  );
}

/** The optional number next to the letter, which must lie in the chosen band. */
export function SapInput({ band, value, onChange }: { band: EpcBand; value: number | null; onChange: (v: number | null) => void }) {
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  const [lo, hi] = EPC_RANGES[band];
  const sap = draft.trim() === "" ? null : Number(draft);
  const bad = sap != null && (!Number.isFinite(sap) || !sapInBand(sap, band));
  return (
    <div>
      <input
        inputMode="numeric"
        aria-label="EPC score"
        aria-invalid={bad}
        placeholder={band === "A" ? "92 or more" : `${lo} to ${hi}`}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = e.target.value.trim() === "" ? null : Number(e.target.value);
          onChange(n != null && Number.isFinite(n) ? n : null);
        }}
        className={cn("w-32 rounded-xl bg-surface-2 px-3 py-2 text-lg outline-none ring-1", bad ? "ring-ember" : "ring-hairline focus:ring-volt")}
      />
      <p className={cn("mt-2 text-xs", bad ? "text-ember" : "text-muted-foreground")}>
        {bad ? `Band ${band} is ${band === "A" ? "92 or more" : `${lo} to ${hi}`}. Check the number or the letter.` : `Optional. Band ${band} is ${band === "A" ? "92 or more" : `${lo} to ${hi}`}.`}
      </p>
    </div>
  );
}

/** Optional whole-number input, for the home's value in pounds. */
export function MoneyInput({ value, min, max, onChange }: { value: number | null; min: number; max: number; onChange: (v: number | null) => void }) {
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  const n = draft.trim() === "" ? null : Number(draft.replace(/[£,\s]/g, ""));
  const bad = n != null && (!Number.isFinite(n) || n < min || n > max);
  return (
    <div>
      <div className={cn("flex w-48 items-center gap-1 rounded-xl bg-surface-2 px-3 py-2 ring-1", bad ? "ring-ember" : "ring-hairline focus-within:ring-volt")}>
        <span className="text-lg text-muted-foreground">£</span>
        <input
          inputMode="numeric"
          aria-label="Home value"
          value={draft}
          placeholder="250000"
          onChange={(e) => {
            setDraft(e.target.value);
            const v = e.target.value.trim() === "" ? null : Number(e.target.value.replace(/[£,\s]/g, ""));
            onChange(v != null && Number.isFinite(v) && v >= min && v <= max ? v : null);
          }}
          className="w-full bg-transparent text-lg outline-none"
        />
      </div>
      <p className={cn("mt-2 text-xs", bad ? "text-ember" : "text-muted-foreground")}>{bad ? `Between £${min.toLocaleString()} and £${max.toLocaleString()}.` : "Optional. A rough figure is fine."}</p>
    </div>
  );
}

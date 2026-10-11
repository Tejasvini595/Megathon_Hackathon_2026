"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { FileText } from "lucide-react";
import { optionLabel, FIELDS, type ExtractionResult } from "@/lib/extract/fields";
import { geometryFromRecord, type FootprintSize } from "@/lib/twin/from-record";
import { cn } from "@/lib/utils";
import { BUILD_STEPS, detailOf, partsUpTo, recordOf } from "./steps";
import type { StageView } from "./capture-flow";

type Props = {
  result: ExtractionResult | null;
  text: string;
  photoUrl?: string;
  hasPlan: boolean;
  onView: (v: StageView) => void;
  onDone: () => void;
  footprint?: FootprintSize;
};

const labelOf = Object.fromEntries(FIELDS.map((f) => [f.key, f.label]));

/**
 * The house assembles part by part from what the extraction found, while the words that support
 * each finding light up in the user's own description.
 */
export function Analysing({ result, text, photoUrl, hasPlan, onView, onDone, footprint }: Props) {
  const reduce = useReducedMotion();
  const [built, setBuilt] = useState(0);
  const finished = built >= BUILD_STEPS.length;

  useEffect(() => {
    if (!result) return;
    const t = setTimeout(finished ? onDone : () => setBuilt((b) => b + 1), finished ? 900 : reduce ? 250 : 650);
    return () => clearTimeout(t);
  }, [result, built, finished, reduce, onDone]);

  const geometry = useMemo(() => geometryFromRecord(result ? recordOf(result.fields) : {}, footprint), [result, footprint]);
  useEffect(() => {
    onView({ geometry, parts: partsUpTo(built), scan: true, autoRotate: true, interactive: false, detail: result ? detailOf(recordOf(result.fields)) : undefined });
  }, [geometry, built, result, onView]);

  const found = result
    ? BUILD_STEPS.slice(0, built).flatMap((s) => s.fields.filter((k) => result.fields[k] && result.fields[k].source !== "default").map((k) => ({ key: k, ...result.fields[k] })))
    : [];
  const unknown = result ? Object.values(result.fields).filter((f) => f.source === "default").length : 0;
  // Every quote is marked from the start (stable keys); revealed ones light up as their part is built.
  const revealed = new Set(found.map((f) => f.quote));
  const marks = result ? Object.values(result.fields).flatMap((f) => (f.quote ? [{ quote: f.quote, active: revealed.has(f.quote) }] : [])) : [];

  return (
    <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 pb-safe pt-2">
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-volt">{finished ? "Done" : "Analysing"}</p>
        <AnimatePresence mode="wait" initial={false}>
          <motion.h1
            key={result ? built : -1}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="mt-1 text-2xl font-medium tracking-tight"
          >
            {!result ? "Reading what you gave us…" : finished ? "Here’s your home, roughly." : `${BUILD_STEPS[built].building}…`}
          </motion.h1>
        </AnimatePresence>
      </div>

      {text ? (
        <p className="rounded-2xl bg-surface px-4 py-3 text-[15px] leading-relaxed text-muted-foreground ring-1 ring-hairline">
          <Highlighted text={text} marks={marks} />
        </p>
      ) : (
        <div className="flex gap-2">
          {photoUrl && (
            <div className="relative size-20 overflow-hidden rounded-2xl ring-1 ring-hairline">
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
              <img src={photoUrl} alt="" className="size-full object-cover opacity-80" />
              {!finished && <div className="absolute inset-x-0 top-0 h-1/2 animate-scan bg-[linear-gradient(to_bottom,transparent,color-mix(in_oklch,var(--volt)_45%,transparent),transparent)]" />}
            </div>
          )}
          {hasPlan && (
            <div className="grid size-20 place-items-center rounded-2xl bg-surface ring-1 ring-hairline">
              <FileText className="size-6 text-frost" />
            </div>
          )}
        </div>
      )}

      <ul className="flex flex-wrap gap-2">
        <AnimatePresence initial={false}>
          {found.map((f) => (
            <motion.li
              key={f.key}
              layout
              initial={{ opacity: 0, scale: 0.8, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 32 }}
              className={cn("rounded-full px-3 py-1.5 text-xs ring-1", f.confidence >= 0.85 ? "bg-volt/10 ring-volt/25" : "bg-amber/10 ring-amber/25")}
            >
              <span className="text-muted-foreground">{labelOf[f.key]} </span>
              <span className="font-medium">{optionLabel(f.key, f.value)}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      {finished && unknown > 0 && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-muted-foreground">
          {unknown} detail{unknown > 1 ? "s" : ""} filled with typical UK values. You’ll check them next.
        </motion.p>
      )}
    </div>
  );
}

/** The user's text with each quoted phrase marked, widened to whole words. */
function Highlighted({ text, marks }: { text: string; marks: { quote: string; active: boolean }[] }) {
  const lower = text.toLowerCase();
  const ranges = marks
    .map(({ quote, active }) => {
      let start = lower.indexOf(quote.toLowerCase());
      if (start < 0) return null;
      let end = start + quote.length;
      while (start > 0 && /\w/.test(text[start - 1])) start--;
      while (end < text.length && /\w/.test(text[end])) end++;
      return { start, end, active };
    })
    .filter((r) => r !== null)
    .sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const { start, end, active } of ranges) {
    if (start < cursor) continue;
    parts.push(<span key={`t${cursor}`}>{text.slice(cursor, start)}</span>);
    parts.push(
      <mark key={start} className={cn("rounded px-0.5 transition-colors duration-500", active ? "bg-volt/15 text-foreground" : "bg-transparent text-inherit")}>
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }
  parts.push(<span key="end">{text.slice(cursor)}</span>);
  return <>{parts}</>;
}

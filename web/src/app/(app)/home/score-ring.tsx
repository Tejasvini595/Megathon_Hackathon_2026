"use client";

import Link from "next/link";
import { AnimatePresence, animate, motion, MotionConfig, useMotionValue, useTransform } from "motion/react";
import { useEffect, useState } from "react";
import { Info, X } from "lucide-react";
import { scoreTone } from "@/lib/score";

export type RangeNote = { chip: string; headline: string; notes: string[]; editHref: string };

/** 270° gauge that counts up to the score on mount. An estimated score also shows its low-high span as a ghost arc. */
export function ScoreRing({
  score,
  label,
  range,
  note,
  size = 140,
  stroke = 8,
}: {
  score: number;
  label: string;
  range?: { low: number; high: number } | null;
  note?: RangeNote;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const arc = 0.75;
  const value = useMotionValue(0);
  const shown = useTransform(value, (v) => Math.round(v).toString());
  const dash = useTransform(value, (v) => `${(v / 100) * c * arc} ${c}`);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const controls = animate(value, score, { duration: 1.4, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [score, value]);

  const ring = (
    <>
      <svg width={size} height={size} className="rotate-[135deg]" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * arc} ${c}`} />
        {range && (
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={scoreTone(score)}
            strokeWidth={stroke + 6}
            strokeLinecap="round"
            strokeDasharray={`${((range.high - range.low) / 100) * c * arc} ${c}`}
            strokeDashoffset={-(range.low / 100) * c * arc}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.14, 0.3, 0.14] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={scoreTone(score)} strokeWidth={stroke} strokeLinecap="round" style={{ strokeDasharray: dash }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <motion.div className="tabular text-5xl font-light tracking-tight">{shown}</motion.div>
          <div className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
        </div>
      </div>
    </>
  );

  if (!range || !note) {
    return (
      <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
        {ring}
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="shrink-0">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`${note.chip}: score between ${range.low} and ${range.high}. Tap for details`}
          className="relative grid place-items-center"
          style={{ width: size, height: size }}
        >
          {ring}
        </button>
        <button type="button" onClick={() => setOpen(true)} className="mx-auto mt-1 flex items-center gap-1 rounded-full bg-amber/15 px-2.5 py-1 text-[10px] font-medium text-amber">
          <Info className="size-3" />
          {note.chip} · {range.low}–{range.high}
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-50 flex items-end bg-black/70" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}>
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={note.chip}
              onClick={(e) => e.stopPropagation()}
              className="mx-auto w-full max-w-md rounded-t-[28px] bg-surface-2 p-5 pb-8 ring-1 ring-hairline"
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 34 }}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-base font-semibold">{note.headline}</h2>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-full bg-surface">
                  <X className="size-4" />
                </button>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                The score could be anywhere from <span className="tabular text-foreground">{range.low}</span> to <span className="tabular text-foreground">{range.high}</span>.
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                {note.notes.map((n) => (
                  <li key={n} className="flex gap-2">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-amber" />
                    {n}
                  </li>
                ))}
              </ul>
              <Link href={note.editHref} className="mt-5 flex h-12 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-primary-foreground active:scale-[0.98]">
                Add your EPC rating
              </Link>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}

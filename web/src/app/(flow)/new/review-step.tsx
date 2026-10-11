"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AnimatePresence, LayoutGroup, motion, useDragControls } from "motion/react";
import { Html } from "@react-three/drei";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, BrickWall, Check, ChevronRight, Eye, EyeOff, Flame, Gauge, Grid2x2, House, Loader2, Ruler, Sparkles, Sun, TriangleAlert, Zap, type LucideIcon } from "lucide-react";
import { geometryFromRecord, type FootprintSize } from "@/lib/twin/from-record";
import { applies, isFlatLike, type EnergyUsage, type ExtractionResult, type FieldKey, type FieldValue } from "@/lib/extract/fields";
import { sapInBand } from "@/lib/extract/epc";
import type { FieldImpact } from "@/lib/questions";
import { usageProblems } from "@/lib/extract/usage";
import type { EpcBand, Geometry } from "@/lib/twin/types";
import { cn } from "@/lib/utils";
import { confirmHome } from "./actions";
import { buzz } from "./controls/haptics";
import { UsageStep } from "./controls/usage-step";
import { DEF, FieldRow, type FieldState, type FieldStates } from "./field-row";
import { missingOf } from "./missing";
import { alternativesOf, arrange, reasonOf, topQuestions } from "./question-order";
import { STEPS, detailOf, recordOf, stepAnchor, type StepId } from "./steps";
import { Summary } from "./summary";
import { useQuestionPlan } from "./use-question-plan";
import type { StageView } from "./capture-flow";

const STEP_ICON: Record<StepId, LucideIcon> = { shape: Ruler, walls: BrickWall, roof: House, windows: Grid2x2, heating: Flame, power: Sun, usage: Zap, rating: Gauge };
const HINTS_KEY = "ght:review-hints";

const SUMMARY = STEPS.length;

const needsCheck = (f: FieldState | undefined) => f != null && f.source !== "you" && f.confidence < 0.85;

/**
 * Character-creator style review: one part of the house per step, the camera flies to it and the
 * rest of the house fades. Controls answer instantly; the camera catches up on its own.
 */
export function ReviewStep({
  homeId,
  extraction,
  onView,
  initialNickname = "My home",
  initialUsage,
  footprint,
  postcode = null,
}: {
  homeId: string;
  extraction: ExtractionResult;
  onView: (v: StageView) => void;
  initialNickname?: string;
  /** Energy use already saved on the home. */
  initialUsage?: EnergyUsage;
  /** The real outline from the map, when the user picked their building. */
  footprint?: FootprintSize;
  postcode?: string | null;
}) {
  const [fields, setFields] = useState<FieldStates>(extraction.fields);
  const [usage, setUsage] = useState<EnergyUsage | undefined>(initialUsage);
  const [[index, dir], setIndex] = useState<[number, number]>([0, 0]);
  const [open, setOpen] = useState(() => new Set(STEPS.flatMap((s) => s.fields).filter((k) => needsCheck(extraction.fields[k]))));
  const [confirmed, setConfirmed] = useState<ReadonlySet<FieldKey>>(() => new Set());
  const [jump, setJump] = useState<FieldKey | null>(null);
  const [nickname, setNickname] = useState(initialNickname);
  const [saving, startSaving] = useTransition();
  const drag = useDragControls();
  const scroller = useRef<HTMLDivElement>(null);
  const [hints, setHints] = useState(() => {
    try {
      return localStorage.getItem(HINTS_KEY) !== "off";
    } catch {
      return true;
    }
  });

  const record = useMemo(() => ({ ...recordOf(fields), usage }), [fields, usage]);
  const missing = useMemo(() => missingOf(record, usage), [record, usage]);
  const geometry = useMemo(() => geometryFromRecord(record, footprint), [record, footprint]);
  const detail = useMemo(() => detailOf(record), [record]);
  const shown = useMemo(() => STEPS.map((s) => s.fields.filter((k) => applies(k, record))), [record]);
  const toCheck = useMemo(() => STEPS.map((s, i) => (s.id === "usage" ? usageProblems(usage, record).length : shown[i].filter((k) => needsCheck(fields[k])).length)), [shown, fields, usage, record]);
  const step = STEPS[index];
  const alternatives = useMemo(() => alternativesOf(fields, extraction.fields, record), [fields, extraction.fields, record]);
  const plan = useQuestionPlan(record, alternatives, postcode);
  const impacts = useMemo(() => new Map(plan?.fields.map((f) => [f.key, f])), [plan]);
  // A step is ordered by the ranking known when the user arrives on it; later plans update labels but never move rows
  // under a finger mid-tap.
  const [entryPlan, setEntryPlan] = useState<{ index: number; plan: typeof plan }>({ index, plan });
  if (entryPlan.index !== index) setEntryPlan({ index, plan });
  const arranged = useMemo(() => (step ? arrange(shown[index], entryPlan.plan, fields) : null), [step, shown, index, entryPlan, fields]);
  const top = useMemo(() => topQuestions(plan, fields, new Set(shown.flat())), [plan, fields, shown]);

  function jumpTo(key: FieldKey) {
    const i = STEPS.findIndex((s) => s.fields.includes(key));
    buzz();
    setOpen((s) => new Set(s).add(key));
    setIndex(([cur]) => [i, i > cur ? 1 : -1]);
    setJump(key);
  }

  function go(i: number) {
    if (i < 0 || i > SUMMARY || i === index) return;
    buzz();
    setIndex([i, i > index ? 1 : -1]);
  }

  const markers = useMemo(() => {
    if (!hints) return null;
    return <Hotspots geometry={geometry} counts={toCheck} current={index} onSelect={(i) => setIndex(([cur]) => [i, i > cur ? 1 : -1])} />;
  }, [geometry, toCheck, index, hints]);

  function toggleHints() {
    setHints((h) => {
      try {
        localStorage.setItem(HINTS_KEY, h ? "off" : "on");
      } catch {}
      return !h;
    });
  }
  useEffect(() => {
    if (jump) return;
    scroller.current?.scrollTo({ top: 0 });
  }, [index, jump]);
  useEffect(() => {
    if (!jump) return;
    const t = setTimeout(() => {
      document.getElementById(`field-${jump}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      setJump(null);
    }, 350);
    return () => clearTimeout(t);
  }, [jump]);
  useEffect(() => {
    onView({ geometry, detail, focus: step?.focus ?? null, isolate: step?.focus ?? null, autoRotate: !step, interactive: true, focusDistance: 1.7, markers });
  }, [geometry, detail, step, markers, onView]);

  function set(key: FieldKey, value: FieldValue | null) {
    setConfirmed((c) => new Set(c).add(key));
    const mine = (v: FieldValue): FieldState => ({ value: v, confidence: 1, source: "you", evidence: "You set this" });
    setFields((f) => {
      const next = { ...f };
      if (value == null) delete next[key];
      else next[key] = mine(value);
      // Flats and maisonettes are always part of a block; leaving one needs a house form back.
      if (key === "propertyType") {
        if (isFlatLike({ propertyType: value as string })) next.builtForm = mine("flat");
        else if (f.builtForm?.value === "flat") next.builtForm = mine("semi");
      }
      // A score that no longer fits the new band is dropped rather than left to fail.
      if (key === "epcBand" && next.sapScore && (value === "unknown" || !sapInBand(Number(next.sapScore.value), value as EpcBand))) delete next.sapScore;
      return next;
    });
  }

  function confirm() {
    startSaving(async () => {
      // Redirects to /home on success; only returns when something went wrong.
      const res = await confirmHome(homeId, { nickname, record: { ...record, usage: usage! } });
      toast.error(res.error);
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <LayoutGroup>
        <nav aria-label="Review steps" className="grid grid-cols-9 px-1.5">
          {[...STEPS, null].map((st, i) => {
            const Icon = st ? STEP_ICON[st.id] : Check;
            const label = st?.label ?? "Done";
            const current = i === index;
            return (
              <button key={label} onClick={() => go(i)} aria-label={label} aria-current={current ? "step" : undefined} className="relative flex flex-col items-center gap-1 pb-2.5 pt-1">
                <Icon className={cn("size-[18px] transition-colors", current ? "text-foreground" : i < index ? "text-foreground/60" : "text-muted-foreground/60")} />
                <span className={cn("text-[9px] leading-none transition-colors", current ? "text-foreground" : "text-muted-foreground/70")}>{label}</span>
                <span className={cn("absolute inset-x-1.5 bottom-0 h-0.5 rounded-full", i < index ? "bg-foreground/25" : "bg-surface-2")} />
                {current && <motion.span layoutId="review-tab" className="absolute inset-x-1.5 bottom-0 h-0.5 rounded-full bg-volt" transition={{ type: "spring", stiffness: 600, damping: 40 }} />}
                {toCheck[i] > 0 && <span className="absolute right-2 top-0.5 size-1.5 rounded-full bg-amber" />}
              </button>
            );
          })}
        </nav>
      </LayoutGroup>

      <div ref={scroller} className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <AnimatePresence mode="popLayout" custom={dir} initial={false}>
          <motion.div
            key={index}
            custom={dir}
            variants={{ enter: (d: number) => ({ x: d * 48, opacity: 0 }), center: { x: 0, opacity: 1 }, exit: (d: number) => ({ x: d * -48, opacity: 0 }) }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            drag="x"
            dragListener={false}
            dragControls={drag}
            // Sliders and text inputs keep their own gestures; anywhere else swipes between steps.
            onPointerDown={(e) => {
              if (!(e.target as HTMLElement).closest("input,select,[data-no-swipe]")) drag.start(e);
            }}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.x < -60 || info.velocity.x < -400) go(index + 1);
              else if (info.offset.x > 60 || info.velocity.x > 400) go(index - 1);
            }}
            className="px-5 pb-6 pt-3"
          >
            {step ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-2xl font-semibold tracking-tight">{step.title ?? step.label}</h2>
                  <button onClick={toggleHints} aria-pressed={hints} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-muted-foreground ring-1 ring-hairline">
                    {hints ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />} Markers
                  </button>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{toCheck[index] > 0 ? `${toCheck[index]} to check. A quick look makes your results much sharper.` : "Looks solid. Tap anything to change it."}</p>
                {extraction.conflicts
                  .filter((c) => step.fields.includes(c.field) && fields[c.field]?.source !== "you")
                  .map((c) => (
                    <p key={c.field} className="mt-3 flex items-start gap-2.5 rounded-2xl bg-ember/10 px-3.5 py-3 text-sm ring-1 ring-ember/25">
                      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-ember" />
                      {c.message}
                    </p>
                  ))}
                {step.id === "usage" ? (
                  <div className="mt-4">
                    <UsageStep usage={usage} heating={String(record.heating)} onChange={setUsage} />
                  </div>
                ) : null}
                {step.id !== "usage" && shown[index].length === 0 && <p className="mt-4 rounded-2xl bg-surface px-4 py-3 text-sm text-muted-foreground ring-1 ring-hairline">Another home sits above yours, so there&apos;s no roof of your own to check.</p>}
                {index === 0 && top.length > 0 && <WhatMatters questions={top} onPick={jumpTo} />}
                {arranged && (
                  <>
                    {(() => {
                      const row = (key: FieldKey, i: number, variant?: "matters" | "confident" | "quick") => (
                        <FieldRow
                          key={key}
                          fieldKey={key}
                          field={fields[key]}
                          record={record}
                          first={i === 0}
                          open={open.has(key)}
                          onToggle={() =>
                            setOpen((s) => {
                              const next = new Set(s);
                              if (!next.delete(key)) next.add(key);
                              return next;
                            })
                          }
                          onChange={(v) => set(key, v)}
                          impact={impacts.get(key)}
                          variant={variant}
                          confirmed={confirmed.has(key) || fields[key]?.source === "you"}
                          onConfirm={() => setConfirmed((c) => new Set(c).add(key))}
                        />
                      );
                      const group = (keys: FieldKey[], variant: "confident" | "quick" | undefined, title?: string) =>
                        keys.length > 0 && (
                          <section>
                            {title && <h3 className="mb-2 mt-5 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>}
                            <div className={cn("overflow-hidden rounded-3xl bg-surface ring-1 ring-hairline", !title && "mt-4")}>
                              <LayoutGroup>{keys.map((k, i) => row(k, i, variant ?? (arranged.matters.has(k) ? "matters" : undefined)))}</LayoutGroup>
                            </div>
                          </section>
                        );
                      return (
                        <>
                          {group(arranged.main, undefined)}
                          {group(arranged.confident, "confident", "Read from your description")}
                          {group(arranged.quick, "quick", "Quick confirms")}
                        </>
                      );
                    })()}
                  </>
                )}
              </>
            ) : (
              <Summary fields={fields} usage={usage} missing={missing} nickname={nickname} onNickname={setNickname} onJump={go} models={extraction.models} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex gap-2 px-5 pb-safe pt-2">
        {index > 0 && (
          <button onClick={() => go(index - 1)} aria-label="Back" className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-surface ring-1 ring-hairline active:scale-95">
            <ArrowLeft className="size-5" />
          </button>
        )}
        {step ? (
          <button onClick={() => go(index + 1)} className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground transition-transform active:scale-[0.98]">
            {STEPS[index + 1]?.label ?? "Review"} <ArrowRight className="size-5" />
          </button>
        ) : (
          <button
            onClick={confirm}
            disabled={saving || missing.length > 0}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-volt text-base font-semibold text-black shadow-[0_10px_40px_-10px_var(--volt)] transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {saving ? <Loader2 className="size-5 animate-spin" /> : missing.length ? <>{missing.length} to finish first</> : <>Looks right. Build my twin</>}
          </button>
        )}
      </div>
    </div>
  );
}

/** Amber markers on the model for parts that still have guesses; tapping one jumps to that step. */
function Hotspots({ geometry, counts, current, onSelect }: { geometry: Geometry; counts: number[]; current: number; onSelect: (i: number) => void }) {
  // The shape step has no single spot on the house; its tab dot is enough.
  return STEPS.map((s, i) => {
    if (["shape", "usage", "rating"].includes(s.id) || counts[i] === 0 || i === current) return null;
    const Icon = STEP_ICON[s.id];
    return (
      <Html key={s.id} position={stepAnchor(s.id, geometry)} center zIndexRange={[10, 0]}>
        <button onClick={() => onSelect(i)} aria-label={`Check ${s.label.toLowerCase()}`} className="grid size-7 place-items-center rounded-full bg-amber text-black shadow-lg ring-4 ring-amber/25 animate-in zoom-in-50">
          <Icon className="size-3.5" />
        </button>
      </Html>
    );
  });
}

/** The few questions that move this home's score or plan the most; tapping one jumps to it. The figures are the engine's estimates. */
function WhatMatters({ questions, onPick }: { questions: FieldImpact[]; onPick: (k: FieldKey) => void }) {
  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 30 }} aria-label="What matters for your home" className="mt-4 rounded-3xl bg-amber/10 p-1.5 ring-1 ring-amber/25">
      <h3 className="flex items-center gap-2 px-3 pb-1 pt-2.5 text-sm font-semibold">
        <Sparkles className="size-4 text-amber" /> What matters for your home
      </h3>
      <p className="px-3 pb-1.5 text-xs text-muted-foreground">Worth a quick look first. These are estimates.</p>
      <ol>
        {questions.map((q) => (
          <li key={q.key}>
            <button onClick={() => onPick(q.key)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left active:bg-amber/10">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-amber/20 text-[10px] font-semibold text-amber">{q.rank}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{DEF[q.key].label}</span>
                <span className="block text-xs text-muted-foreground">{reasonOf(q)}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ol>
    </motion.section>
  );
}

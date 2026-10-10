"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { AnimatePresence, LayoutGroup, motion, useDragControls } from "motion/react";
import { Html } from "@react-three/drei";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  BrickWall,
  Camera,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  FileText,
  Flame,
  Grid2x2,
  House,
  Loader2,
  Map as MapIcon,
  MapPin,
  Mic,
  Minus,
  PenLine,
  Plus,
  Ruler,
  Sparkles,
  Sun,
  TriangleAlert,
  Type,
  type LucideIcon,
} from "lucide-react";
import { geometryFromRecord } from "@/lib/twin/from-record";
import { applies, FIELDS, isFlatLike, optionLabel, type ExtractedField, type ExtractionResult, type FieldKey, type FieldSource, type FieldValue } from "@/lib/extract/fields";
import type { Geometry } from "@/lib/twin/types";
import { cn } from "@/lib/utils";
import { confirmHome } from "./actions";
import { STEPS, detailOf, recordOf, stepAnchor, type StepId } from "./steps";
import type { StageView } from "./capture-flow";

type Source = FieldSource | "you";
type FieldState = Omit<ExtractedField, "source"> & { source: Source };

const SOURCE_ICON: Record<Source, LucideIcon> = {
  photo: Camera,
  text: Type,
  plan: FileText,
  voice: Mic,
  postcode: MapPin,
  map: MapIcon,
  default: Sparkles,
  you: PenLine,
};

const STEP_ICON: Record<StepId, LucideIcon> = { shape: Ruler, walls: BrickWall, roof: House, windows: Grid2x2, heating: Flame, power: Sun };
const HINTS_KEY = "ght:review-hints";

const DEF = Object.fromEntries(FIELDS.map((f) => [f.key, f])) as Record<FieldKey, (typeof FIELDS)[number]>;
const SUMMARY = STEPS.length;

function tier(conf: number, source: Source) {
  if (source === "you") return { label: "You", className: "bg-foreground/10 text-foreground" };
  if (conf >= 0.85) return { label: "Sure", className: "bg-volt/15 text-volt" };
  if (conf >= 0.6) return { label: "Likely", className: "bg-amber/15 text-amber" };
  return { label: "Guess", className: "bg-surface-2 text-muted-foreground" };
}

const needsCheck = (f: FieldState) => f.source !== "you" && f.confidence < 0.85;
const buzz = () => navigator.vibrate?.(8);

/**
 * Character-creator style review: one part of the house per step, the camera flies to it and the
 * rest of the house fades. Controls answer instantly; the camera catches up on its own.
 */
export function ReviewStep({ homeId, extraction, onView }: { homeId: string; extraction: ExtractionResult; onView: (v: StageView) => void }) {
  const [fields, setFields] = useState<Record<FieldKey, FieldState>>(extraction.fields);
  const [[index, dir], setIndex] = useState<[number, number]>([0, 0]);
  const [open, setOpen] = useState(() => new Set(FIELDS.map((f) => f.key).filter((k) => needsCheck(extraction.fields[k]))));
  const [nickname, setNickname] = useState("My home");
  const [saving, startSaving] = useTransition();
  const drag = useDragControls();
  const [hints, setHints] = useState(() => {
    try {
      return localStorage.getItem(HINTS_KEY) !== "off";
    } catch {
      return true;
    }
  });

  const record = useMemo(() => recordOf(fields), [fields]);
  const geometry = useMemo(() => geometryFromRecord(record), [record]);
  const detail = useMemo(() => detailOf(record), [record]);
  const shown = STEPS.map((s) => s.fields.filter((k) => applies(k, record)));
  const toCheck = shown.map((keys) => keys.filter((k) => needsCheck(fields[k])).length);
  const step = STEPS[index];

  function go(i: number) {
    if (i < 0 || i > SUMMARY || i === index) return;
    buzz();
    setIndex([i, i > index ? 1 : -1]);
  }

  const markers = useMemo(() => {
    if (!hints) return null;
    const counts = STEPS.map((st) => st.fields.filter((k) => applies(k, record) && needsCheck(fields[k])).length);
    return <Hotspots geometry={geometry} counts={counts} current={index} onSelect={(i) => setIndex(([cur]) => [i, i > cur ? 1 : -1])} />;
  }, [geometry, record, fields, index, hints]);

  function toggleHints() {
    setHints((h) => {
      try {
        localStorage.setItem(HINTS_KEY, h ? "off" : "on");
      } catch {}
      return !h;
    });
  }
  useEffect(() => {
    onView({ geometry, detail, focus: step?.focus ?? null, isolate: step?.focus ?? null, autoRotate: !step, interactive: true, focusDistance: 1.7, markers });
  }, [geometry, detail, step, markers, onView]);

  function set(key: FieldKey, value: FieldValue) {
    const mine = (v: FieldValue): FieldState => ({ value: v, confidence: 1, source: "you", evidence: "You set this" });
    setFields((f) => {
      const next = { ...f, [key]: mine(value) };
      // Flats and maisonettes are always part of a block; leaving one needs a house form back.
      if (key === "propertyType") {
        if (isFlatLike({ propertyType: value as string })) next.builtForm = mine("flat");
        else if (f.builtForm.value === "flat") next.builtForm = mine("semi");
      }
      return next;
    });
  }

  function confirm() {
    startSaving(async () => {
      // Redirects to /home on success; only returns when something went wrong.
      const res = await confirmHome(homeId, { nickname, record });
      toast.error(res.error);
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <LayoutGroup>
        <nav aria-label="Review steps" className="grid grid-cols-7 px-3">
          {[...STEPS, null].map((st, i) => {
            const Icon = st ? STEP_ICON[st.id] : Check;
            const label = st?.label ?? "Done";
            const current = i === index;
            return (
              <button key={label} onClick={() => go(i)} aria-label={label} aria-current={current ? "step" : undefined} className="relative flex flex-col items-center gap-1 pb-2.5 pt-1">
                <Icon className={cn("size-[18px] transition-colors", current ? "text-foreground" : i < index ? "text-foreground/60" : "text-muted-foreground/60")} />
                <span className={cn("text-[10px] leading-none transition-colors", current ? "text-foreground" : "text-muted-foreground/70")}>{label}</span>
                <span className={cn("absolute inset-x-1.5 bottom-0 h-0.5 rounded-full", i < index ? "bg-foreground/25" : "bg-surface-2")} />
                {current && <motion.span layoutId="review-tab" className="absolute inset-x-1.5 bottom-0 h-0.5 rounded-full bg-volt" transition={{ type: "spring", stiffness: 600, damping: 40 }} />}
                {toCheck[i] > 0 && <span className="absolute right-2 top-0.5 size-1.5 rounded-full bg-amber" />}
              </button>
            );
          })}
        </nav>
      </LayoutGroup>

      <div className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
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
              if (!(e.target as HTMLElement).closest("input")) drag.start(e);
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
                  <h2 className="text-2xl font-semibold tracking-tight">{step.label}</h2>
                  <button onClick={toggleHints} aria-pressed={hints} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-muted-foreground ring-1 ring-hairline">
                    {hints ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />} Markers
                  </button>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {toCheck[index] > 0 ? `${toCheck[index]} to check. A quick look makes your results much sharper.` : "Looks solid. Tap anything to change it."}
                </p>
                {extraction.conflicts
                  .filter((c) => step.fields.includes(c.field) && fields[c.field].source !== "you")
                  .map((c) => (
                    <p key={c.field} className="mt-3 flex items-start gap-2.5 rounded-2xl bg-ember/10 px-3.5 py-3 text-sm ring-1 ring-ember/25">
                      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-ember" />
                      {c.message}
                    </p>
                  ))}
                {shown[index].length === 0 && <p className="mt-4 rounded-2xl bg-surface px-4 py-3 text-sm text-muted-foreground ring-1 ring-hairline">Another home sits above yours, so there&apos;s no roof of your own to check.</p>}
                <div className="mt-4 overflow-hidden rounded-3xl bg-surface ring-1 ring-hairline empty:hidden">
                  {shown[index].map((key, i) => (
                    <FieldRow
                      key={key}
                      fieldKey={key}
                      field={fields[key]}
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
                    />
                  ))}
                </div>
              </>
            ) : (
              <Summary fields={fields} nickname={nickname} onNickname={setNickname} onJump={go} models={extraction.models} />
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
            disabled={saving}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-volt text-base font-semibold text-black shadow-[0_10px_40px_-10px_var(--volt)] transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {saving ? <Loader2 className="size-5 animate-spin" /> : <>Looks right. Build my twin</>}
          </button>
        )}
      </div>
    </div>
  );
}

function FieldRow({ fieldKey, field: f, first, open, onToggle, onChange }: { fieldKey: FieldKey; field: FieldState; first: boolean; open: boolean; onToggle: () => void; onChange: (v: FieldValue) => void }) {
  const def = DEF[fieldKey];
  const t = tier(f.confidence, f.source);
  const Icon = SOURCE_ICON[f.source];
  return (
    <div className={cn(!first && "border-t hairline")}>
      <button onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-sm text-muted-foreground">{def.label}</span>
        <span className="text-sm font-medium">{optionLabel(fieldKey, f.value)}</span>
        <span className={cn("w-14 rounded-full py-0.5 text-center text-[10px] font-medium", t.className)}>{t.label}</span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="px-4 pb-4">
              <p className="mb-3 text-xs text-muted-foreground">
                {f.evidence}
                {f.source !== "you" && <span className="tabular"> · {Math.round(f.confidence * 100)}% confidence</span>}
              </p>
              {def.kind !== "number" ? (
                <div className="flex flex-wrap gap-2">
                  {def.kind === "multi" && <p className="w-full text-[11px] text-muted-foreground">Pick all that apply.</p>}
                  {def.options.map((o) => {
                    const list = Array.isArray(f.value) ? f.value : [];
                    const on = def.kind === "multi" ? list.includes(o.value) : f.value === o.value;
                    return (
                      <button
                        key={o.value}
                        aria-pressed={on}
                        onClick={() => {
                          buzz();
                          onChange(def.kind === "multi" ? (on ? list.filter((v) => v !== o.value) : [...list, o.value]) : o.value);
                        }}
                        className={cn("flex items-center gap-1 rounded-full px-3 py-1.5 text-sm ring-1 transition-colors", on ? "bg-foreground text-background ring-foreground" : "ring-hairline hover:bg-surface-2")}
                      >
                        {on && <Check className="size-3.5" />}
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <Stepper value={Number(f.value)} min={def.min} max={def.max} step={"step" in def ? def.step : 1} unit={"unit" in def ? def.unit : undefined} onChange={onChange} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Summary({ fields, nickname, onNickname, onJump, models }: { fields: Record<FieldKey, FieldState>; nickname: string; onNickname: (s: string) => void; onJump: (i: number) => void; models: string[] }) {
  return (
    <>
      <h2 className="text-2xl font-semibold tracking-tight">Looking good.</h2>
      <p className="mt-1 text-sm text-muted-foreground">Give it a name and we&apos;ll build your twin. You can change any of this later.</p>
      <label className="mt-4 block rounded-2xl bg-surface px-4 py-3 ring-1 ring-hairline">
        <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Name this home</span>
        <input value={nickname} onChange={(e) => onNickname(e.target.value)} maxLength={60} className="mt-0.5 w-full bg-transparent text-base outline-none" />
      </label>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {STEPS.map((s, i) => (
          <button key={s.id} onClick={() => onJump(i)} className="rounded-2xl bg-surface px-3.5 py-3 text-left ring-1 ring-hairline active:scale-[0.98]">
            <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{s.label}</span>
            <span className="mt-1 line-clamp-2 block text-sm">{s.fields.slice(0, 2).map((k) => optionLabel(k, fields[k].value)).join(" · ")}</span>
          </button>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">Read by: {models.join(", ")}.</p>
    </>
  );
}

/** Amber markers on the model for parts that still have guesses; tapping one jumps to that step. */
function Hotspots({ geometry, counts, current, onSelect }: { geometry: Geometry; counts: number[]; current: number; onSelect: (i: number) => void }) {
  // The shape step has no single spot on the house; its tab dot is enough.
  return STEPS.map((s, i) => {
    if (s.id === "shape" || counts[i] === 0 || i === current) return null;
    const Icon = STEP_ICON[s.id];
    return (
      <Html key={s.id} position={stepAnchor(s.id, geometry)} center zIndexRange={[10, 0]}>
        <button
          onClick={() => onSelect(i)}
          aria-label={`Check ${s.label.toLowerCase()}`}
          className="grid size-7 place-items-center rounded-full bg-amber text-black shadow-lg ring-4 ring-amber/25 animate-in zoom-in-50"
        >
          <Icon className="size-3.5" />
        </button>
      </Html>
    );
  });
}

function Stepper({ value, min, max, step = 1, unit, onChange }: { value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="flex items-center gap-3">
      <button onClick={() => onChange(clamp(value - step))} className="grid size-10 place-items-center rounded-full bg-surface-2" aria-label="Decrease">
        <Minus className="size-4" />
      </button>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-surface-2 accent-[var(--volt)]"
      />
      <button onClick={() => onChange(clamp(value + step))} className="grid size-10 place-items-center rounded-full bg-surface-2" aria-label="Increase">
        <Plus className="size-4" />
      </button>
      <span className="tabular w-16 text-right text-sm font-medium">
        {value}
        {unit ? ` ${unit}` : ""}
      </span>
    </div>
  );
}

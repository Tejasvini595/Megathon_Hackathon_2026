"use client";

import { AnimatePresence, motion } from "motion/react";
import { Camera, Check, ChevronDown, FileText, Map as MapIcon, Mic, MapPin, PenLine, Sparkles, Type, type LucideIcon } from "lucide-react";
import { FIELDS, optionLabel, type ExtractedField, type FieldDef, type FieldKey, type FieldSource, type FieldValue, type PropertyRecord } from "@/lib/extract/fields";
import type { FieldImpact } from "@/lib/questions";
import type { EpcBand } from "@/lib/twin/types";
import { cn } from "@/lib/utils";
import { AgeTimeline } from "./controls/age-timeline";
import { BoilerChoice } from "./controls/boiler-choice";
import { EpcPicker, MoneyInput, SapInput } from "./controls/epc-field";
import { buzz } from "./controls/haptics";
import { LoftPicker } from "./controls/loft-picker";
import { SolarInput } from "./controls/solar-input";
import { Stepper } from "./controls/stepper";
import { ThermostatDial } from "./controls/thermostat-dial";

export type Source = FieldSource | "you";
export type FieldState = Omit<ExtractedField, "source"> & { source: Source };
/** Optional fields are absent until given. */
export type FieldStates = Partial<Record<FieldKey, FieldState>>;

const SOURCE_ICON: Record<Source, LucideIcon> = { photo: Camera, text: Type, plan: FileText, voice: Mic, postcode: MapPin, map: MapIcon, default: Sparkles, you: PenLine };

export const DEF = Object.fromEntries(FIELDS.map((f) => [f.key, f])) as Record<FieldKey, FieldDef>;

export function tier(conf: number, source: Source) {
  if (source === "you") return { label: "You", className: "bg-foreground/10 text-foreground" };
  if (conf >= 0.85) return { label: "Sure", className: "bg-volt/15 text-volt" };
  if (conf >= 0.6) return { label: "Likely", className: "bg-amber/15 text-amber" };
  return { label: "Guess", className: "bg-surface-2 text-muted-foreground" };
}

/** The value as the row shows it. */
export function display(key: FieldKey, value: FieldValue | undefined) {
  if (value == null) return "Not given";
  if (key === "epcBand" && value === "unknown") return "We'll estimate it";
  return optionLabel(key, value);
}

type Props = {
  fieldKey: FieldKey;
  field: FieldState | undefined;
  record: PropertyRecord;
  first: boolean;
  open: boolean;
  onToggle: () => void;
  onChange: (v: FieldValue | null) => void;
  /** What the engine says about this question, once it has. */
  impact?: FieldImpact;
  /** How the review treats it: amber "matters" marker, or a pre-filled answer that is one tap to confirm. */
  variant?: "matters" | "confident" | "quick";
  confirmed?: boolean;
  onConfirm?: () => void;
};

export function FieldRow({ fieldKey, field: f, record, first, open, onToggle, onChange, impact, variant, confirmed, onConfirm }: Props) {
  const def = DEF[fieldKey];
  const t = f ? tier(f.confidence, f.source) : { label: "Optional", className: "bg-surface-2 text-muted-foreground" };
  const Icon = SOURCE_ICON[f?.source ?? "default"];
  return (
    <motion.div layout="position" transition={{ type: "spring", stiffness: 500, damping: 40 }} id={`field-${fieldKey}`} className={cn(!first && "border-t hairline")}>
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex flex-1 flex-col text-sm text-muted-foreground">
          {def.label}
          {variant === "matters" && <span className="text-[10px] font-medium uppercase tracking-wide text-amber">Matters</span>}
        </span>
        <span className="text-sm font-medium">{display(fieldKey, f?.value)}</span>
        <span className={cn("w-14 rounded-full py-0.5 text-center text-[10px] font-medium", t.className)}>{t.label}</span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {!confirmed && onConfirm && (variant === "confident" || variant === "quick") && f && (
        <div className="-mt-1.5 flex items-center justify-between gap-3 px-4 pb-3 pl-11">
          <span className="text-xs text-muted-foreground">
            {variant === "confident" ? (
              <>
                Read from your description · <span className="tabular">{Math.round(Math.max(f.confidence, ...Object.values(impact?.probabilities ?? {})) * 100)}%</span>
              </>
            ) : (
              "Most likely answer"
            )}
          </span>
          <button
            onClick={() => {
              buzz();
              onConfirm();
            }}
            className="flex items-center gap-1 rounded-full bg-volt/15 px-3 py-1 text-xs font-medium text-volt active:scale-95"
          >
            <Check className="size-3.5" /> Confirm
          </button>
        </div>
      )}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="px-4 pb-4">
              <p className="mb-3 text-xs text-muted-foreground">
                {f ? f.evidence : "Optional. Skip it if you don't know."}
                {f && f.source !== "you" && <span className="tabular"> · {Math.round(f.confidence * 100)}% confidence</span>}
              </p>
              {def.hint && fieldKey !== "boilerAge" && <p className="-mt-1 mb-3 text-xs text-muted-foreground">{def.hint}</p>}
              <Control fieldKey={fieldKey} value={f?.value ?? null} record={record} onChange={onChange} probabilities={impact?.probabilities} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Control({ fieldKey, value, record, onChange, probabilities }: { fieldKey: FieldKey; value: FieldValue | null; record: PropertyRecord; onChange: (v: FieldValue | null) => void; probabilities?: Record<string, number> }) {
  const def = DEF[fieldKey];
  switch (fieldKey) {
    case "ageBand":
      return <AgeTimeline value={String(value)} onChange={onChange} />;
    case "loftInsulation":
      return <LoftPicker value={String(value)} onChange={onChange} />;
    case "boilerAge":
      return <BoilerChoice value={String(value)} hint={def.hint} onChange={onChange} />;
    case "epcBand":
      return <EpcPicker value={String(value)} onChange={onChange} />;
    case "sapScore":
      return <SapInput band={record.epcBand as EpcBand} value={value as number | null} onChange={onChange} />;
    case "currentValueGbp":
      return def.kind === "number" ? <MoneyInput value={value as number | null} min={def.min} max={def.max} onChange={onChange} /> : null;
    case "solarKw":
      return def.kind === "number" ? <SolarInput value={Number(value ?? def.min)} min={def.min} max={def.max} onChange={onChange} /> : null;
    case "thermostatC":
      return def.kind === "number" ? <ThermostatDial value={value as number | null} min={def.min} max={def.max} step={def.step ?? 0.5} onChange={onChange} /> : null;
  }
  if (def.kind === "number") return <Stepper value={Number(value ?? def.min)} min={def.min} max={def.max} step={def.step ?? 1} unit={def.unit} onChange={onChange} />;
  // An even spread says nothing, so bars only appear when the decision model actually leaned.
  const values = Object.values(probabilities ?? {});
  const lean = values.length > 1 && Math.max(...values) - Math.min(...values) > 0.02;
  return (
    <div className="flex flex-wrap gap-2">
      {def.options.map((o) => {
        const on = value === o.value;
        const p = lean ? (probabilities?.[o.value] ?? 0) : 0;
        return (
          <button
            key={o.value}
            aria-pressed={on}
            onClick={() => {
              buzz();
              onChange(o.value);
            }}
            className={cn("relative flex items-center gap-1 overflow-hidden rounded-full px-3 py-1.5 text-sm ring-1 transition-colors", on ? "bg-foreground text-background ring-foreground" : "ring-hairline hover:bg-surface-2")}
          >
            {on && <Check className="size-3.5" />}
            {o.label}
            {lean && (
              <span aria-hidden className="absolute inset-x-3 bottom-0 h-[2px] overflow-hidden rounded-full">
                <motion.span initial={{ scaleX: 0 }} animate={{ scaleX: p }} transition={{ type: "spring", stiffness: 200, damping: 30 }} className={cn("block h-full origin-left", on ? "bg-background/60" : "bg-volt/70")} />
              </span>
            )}
            {lean && <span className="sr-only"> {Math.round(p * 100)}% likely</span>}
          </button>
        );
      })}
    </div>
  );
}

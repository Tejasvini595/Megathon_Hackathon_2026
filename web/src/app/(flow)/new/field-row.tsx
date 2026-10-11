"use client";

import { AnimatePresence, motion } from "motion/react";
import { Camera, Check, ChevronDown, FileText, Map as MapIcon, Mic, MapPin, PenLine, Sparkles, Type, type LucideIcon } from "lucide-react";
import { FIELDS, optionLabel, type ExtractedField, type FieldDef, type FieldKey, type FieldSource, type FieldValue, type PropertyRecord } from "@/lib/extract/fields";
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
};

export function FieldRow({ fieldKey, field: f, record, first, open, onToggle, onChange }: Props) {
  const def = DEF[fieldKey];
  const t = f ? tier(f.confidence, f.source) : { label: "Optional", className: "bg-surface-2 text-muted-foreground" };
  const Icon = SOURCE_ICON[f?.source ?? "default"];
  return (
    <div className={cn(!first && "border-t hairline")}>
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-sm text-muted-foreground">{def.label}</span>
        <span className="text-sm font-medium">{display(fieldKey, f?.value)}</span>
        <span className={cn("w-14 rounded-full py-0.5 text-center text-[10px] font-medium", t.className)}>{t.label}</span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="px-4 pb-4">
              <p className="mb-3 text-xs text-muted-foreground">
                {f ? f.evidence : "Optional. Skip it if you don't know."}
                {f && f.source !== "you" && <span className="tabular"> · {Math.round(f.confidence * 100)}% confidence</span>}
              </p>
              {def.hint && fieldKey !== "boilerAge" && <p className="-mt-1 mb-3 text-xs text-muted-foreground">{def.hint}</p>}
              <Control fieldKey={fieldKey} value={f?.value ?? null} record={record} onChange={onChange} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Control({ fieldKey, value, record, onChange }: { fieldKey: FieldKey; value: FieldValue | null; record: PropertyRecord; onChange: (v: FieldValue | null) => void }) {
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
  return (
    <div className="flex flex-wrap gap-2">
      {def.options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            aria-pressed={on}
            onClick={() => {
              buzz();
              onChange(o.value);
            }}
            className={cn("flex items-center gap-1 rounded-full px-3 py-1.5 text-sm ring-1 transition-colors", on ? "bg-foreground text-background ring-foreground" : "ring-hairline hover:bg-surface-2")}
          >
            {on && <Check className="size-3.5" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

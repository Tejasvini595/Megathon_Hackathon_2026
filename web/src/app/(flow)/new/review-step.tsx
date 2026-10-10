"use client";

import { useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Camera, Check, FileText, Loader2, MapPin, Mic, Minus, PenLine, Plus, Sparkles, TriangleAlert, Type, type LucideIcon } from "lucide-react";
import { TwinCanvas } from "@/components/twin/twin-canvas";
import { geometryFromRecord } from "@/lib/twin/from-record";
import { MOCK_TWIN } from "@/lib/twin/mock";
import { FIELDS, GROUPS, optionLabel, type ExtractedField, type ExtractionResult, type FieldKey, type FieldSource, type PropertyRecord } from "@/lib/extract/fields";
import { cn } from "@/lib/utils";
import { confirmHome } from "./actions";

type Source = FieldSource | "you";
type FieldState = Omit<ExtractedField, "source"> & { source: Source };

const SOURCE_ICON: Record<Source, LucideIcon> = {
  photo: Camera,
  text: Type,
  plan: FileText,
  voice: Mic,
  postcode: MapPin,
  default: Sparkles,
  you: PenLine,
};

function tier(conf: number, source: Source) {
  if (source === "you") return { label: "You", className: "bg-foreground/10 text-foreground" };
  if (conf >= 0.85) return { label: "Sure", className: "bg-volt/15 text-volt" };
  if (conf >= 0.6) return { label: "Likely", className: "bg-amber/15 text-amber" };
  return { label: "Guess", className: "bg-surface-2 text-muted-foreground" };
}

export function ReviewStep({ homeId, extraction }: { homeId: string; extraction: ExtractionResult }) {
  const [fields, setFields] = useState<Record<FieldKey, FieldState>>(extraction.fields);
  const [open, setOpen] = useState<FieldKey | null>(null);
  const [nickname, setNickname] = useState("My home");
  const [saving, startSaving] = useTransition();

  const record = useMemo(
    () => Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, f.value])) as PropertyRecord,
    [fields],
  );
  const geometry = useMemo(() => geometryFromRecord(record), [record]);
  const guesses = Object.values(fields).filter((f) => f.source !== "you" && f.confidence < 0.6).length;
  const conflicted = new Set(extraction.conflicts.map((c) => c.field));

  function set(key: FieldKey, value: string | number) {
    setFields((f) => ({ ...f, [key]: { value, confidence: 1, source: "you", evidence: "You set this" } }));
  }

  function confirm() {
    startSaving(async () => {
      // Redirects to /home on success; only returns when something went wrong.
      const res = await confirmHome(homeId, { nickname, record });
      toast.error(res.error);
    });
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="sticky top-0 z-10 h-56 bg-background">
        <TwinCanvas geometry={geometry} heatLoss={MOCK_TWIN.heatLoss} mode="normal" className="absolute inset-0" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-[linear-gradient(transparent,var(--background))]" />
      </div>

      <div className="px-5 pb-36">
        <h1 className="text-3xl font-semibold tracking-tight">Here&apos;s what we found.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tap anything that&apos;s off. {guesses > 0 ? `${guesses} item${guesses > 1 ? "s are" : " is a"} guess${guesses > 1 ? "es" : ""}; a quick check makes your results much sharper.` : "Everything looks well supported."}
        </p>

        <label className="mt-6 block rounded-2xl bg-surface px-4 py-3 ring-1 ring-hairline">
          <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Name this home</span>
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={60} className="mt-0.5 w-full bg-transparent text-base outline-none" />
        </label>

        {extraction.conflicts.length > 0 && (
          <div className="mt-4 space-y-2">
            {extraction.conflicts.map((c) => (
              <button key={c.field} onClick={() => setOpen(c.field)} className="flex w-full items-start gap-2.5 rounded-2xl bg-ember/10 px-3.5 py-3 text-left text-sm ring-1 ring-ember/25">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-ember" />
                <span>{c.message}</span>
              </button>
            ))}
          </div>
        )}

        {GROUPS.map((group) => (
          <section key={group} className="mt-7">
            <h2 className="mb-2 px-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{group}</h2>
            <div className="overflow-hidden rounded-3xl bg-surface ring-1 ring-hairline">
              {FIELDS.filter((d) => d.group === group).map((def, i) => {
                const f = fields[def.key];
                const t = tier(f.confidence, f.source);
                const Icon = SOURCE_ICON[f.source];
                const isOpen = open === def.key;
                return (
                  <div key={def.key} className={cn(i > 0 && "border-t hairline", conflicted.has(def.key) && f.source !== "you" && "bg-ember/5")}>
                    <button onClick={() => setOpen(isOpen ? null : def.key)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 text-sm text-muted-foreground">{def.label}</span>
                      <span className="text-sm font-medium">{optionLabel(def.key, f.value)}</span>
                      <span className={cn("w-14 rounded-full py-0.5 text-center text-[10px] font-medium", t.className)}>{t.label}</span>
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                          <div className="px-4 pb-4">
                            <p className="mb-3 text-xs text-muted-foreground">
                              {f.evidence}
                              {f.source !== "you" && <span className="tabular"> · {Math.round(f.confidence * 100)}% confidence</span>}
                            </p>
                            {def.kind === "enum" ? (
                              <div className="flex flex-wrap gap-2">
                                {def.options.map((o) => (
                                  <button
                                    key={o.value}
                                    onClick={() => set(def.key, o.value)}
                                    className={cn(
                                      "flex items-center gap-1 rounded-full px-3 py-1.5 text-sm ring-1 transition-colors",
                                      f.value === o.value ? "bg-foreground text-background ring-foreground" : "ring-hairline hover:bg-surface-2",
                                    )}
                                  >
                                    {f.value === o.value && <Check className="size-3.5" />}
                                    {o.label}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <Stepper value={Number(f.value)} min={def.min} max={def.max} step={"step" in def ? def.step : 1} unit={"unit" in def ? def.unit : undefined} onChange={(v) => set(def.key, v)} />
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        <p className="mt-6 text-xs text-muted-foreground">Models: {extraction.models.join(", ")}. You can change any of this later.</p>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md bg-[linear-gradient(transparent,var(--background)_35%)] px-5 pb-safe pt-8">
        <button
          onClick={confirm}
          disabled={saving}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-volt text-base font-semibold text-black shadow-[0_10px_40px_-10px_var(--volt)] transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          {saving ? <Loader2 className="size-5 animate-spin" /> : <>Looks right. Build my twin</>}
        </button>
      </div>
    </div>
  );
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

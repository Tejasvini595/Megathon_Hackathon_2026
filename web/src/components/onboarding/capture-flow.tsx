"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import {
  ArrowRight,
  ArrowUp,
  Camera,
  Check,
  FileText,
  ImagePlus,
  Loader2,
  MapPin,
  Mic,
  Square,
  TriangleAlert,
  X,
} from "lucide-react";
import { useDictation } from "@/hooks/use-dictation";
import { cn } from "@/lib/utils";
import type { ExtractionResult } from "@/lib/extract/fields";
import { ReviewStep } from "./review-step";

type Step = "compose" | "analysing" | "review";

const EXAMPLES = [
  "1930s semi, 3 bed, gas combi boiler, single glazing at the back",
  "Top-floor flat, electric storage heaters, double glazed",
  "Victorian mid terrace, solid brick walls, 100mm loft insulation",
  "Detached 1990s house with solar panels and a Nest thermostat",
];

const SAMPLE =
  "1930s semi-detached, 3 bed, about 85 m2. Mostly single glazing, gas combi boiler, 50mm loft insulation, cavity walls with no insulation. Programmer and TRVs.";

export function CaptureFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("compose");
  const [text, setText] = useState("");
  const [voice, setVoice] = useState<string[]>([]);
  const [postcode, setPostcode] = useState("");
  const [showPostcode, setShowPostcode] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [plans, setPlans] = useState<File[]>([]);
  const [result, setResult] = useState<{ homeId: string; extraction: ExtractionResult } | null>(null);
  const [placeholder, setPlaceholder] = useState(0);

  const photoUrls = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos]);
  useEffect(() => () => photoUrls.forEach((u) => URL.revokeObjectURL(u)), [photoUrls]);

  useEffect(() => {
    const t = setInterval(() => setPlaceholder((p) => (p + 1) % EXAMPLES.length), 3200);
    return () => clearInterval(t);
  }, []);

  const dictation = useDictation((t) => t && setVoice((v) => [...v, t]));
  const hasInput = text.trim() || voice.length || postcode.trim() || photos.length || plans.length;

  async function analyse() {
    if (!hasInput) return;
    dictation.stop();
    setStep("analysing");
    const form = new FormData();
    form.set("text", text);
    form.set("voice", voice.join(". "));
    form.set("postcode", postcode);
    photos.forEach((f) => form.append("photos", f));
    plans.forEach((f) => form.append("plans", f));
    const started = Date.now();
    try {
      const res = await fetch("/api/homes", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't analyse that");
      // Let the analysis animation breathe even when the stub answers instantly.
      await new Promise((r) => setTimeout(r, Math.max(0, 3600 - (Date.now() - started))));
      setResult(json);
      setStep("review");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
      setStep("compose");
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <header className="flex items-center justify-between px-5 pt-safe">
        <Link href="/home" aria-label="Close" className="grid size-10 place-items-center rounded-full bg-surface ring-1 ring-hairline">
          <X className="size-4" />
        </Link>
        <div className="flex gap-1.5">
          {(["compose", "analysing", "review"] as Step[]).map((s) => (
            <span key={s} className={cn("h-1 rounded-full transition-all", s === step ? "w-6 bg-foreground" : "w-1.5 bg-surface-2")} />
          ))}
        </div>
        <span className="size-10" />
      </header>

      <AnimatePresence mode="wait">
        {step === "compose" && (
          <motion.div
            key="compose"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-1 flex-col px-5 pb-safe"
          >
            <div className="pt-8">
              <h1 className="text-gradient text-[2.4rem] font-semibold leading-[1.05] tracking-tight">Tell us about your home.</h1>
              <p className="mt-3 text-muted-foreground">Snap it, describe it, drop a floor plan, or just talk. Anything helps; you&apos;ll check what we find.</p>
            </div>

            <div className="glass mt-7 rounded-[28px] p-3 shadow-2xl shadow-black/40">
              {/* attachments */}
              <AnimatePresence initial={false}>
                {(photos.length > 0 || plans.length > 0 || voice.length > 0) && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="flex gap-2 overflow-x-auto pb-3 [scrollbar-width:none]">
                      {photos.map((f, i) => (
                        <Thumb key={photoUrls[i]} onRemove={() => setPhotos((p) => p.filter((_, j) => j !== i))}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={photoUrls[i]} alt={f.name} className="size-full object-cover" />
                        </Thumb>
                      ))}
                      {plans.map((f, i) => (
                        <Thumb key={f.name + i} onRemove={() => setPlans((p) => p.filter((_, j) => j !== i))}>
                          <div className="flex size-full flex-col items-center justify-center gap-1 bg-surface-2 p-1 text-center">
                            <FileText className="size-5 text-frost" />
                            <span className="line-clamp-2 text-[9px] leading-tight text-muted-foreground">{f.name}</span>
                          </div>
                        </Thumb>
                      ))}
                      {voice.map((v, i) => (
                        <div key={i} className="relative flex h-20 w-44 shrink-0 flex-col justify-between rounded-2xl bg-volt/10 p-2.5 ring-1 ring-volt/20">
                          <Mic className="size-3.5 text-volt" />
                          <p className="line-clamp-2 text-[11px] leading-snug">{v}</p>
                          <button onClick={() => setVoice((vs) => vs.filter((_, j) => j !== i))} className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-black/50" aria-label="Remove">
                            <X className="size-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="relative">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={4}
                  className="w-full resize-none bg-transparent px-2 pt-1 text-[17px] leading-relaxed outline-none placeholder:text-transparent"
                  aria-label="Describe your home"
                />
                {!text && (
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={placeholder}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      className="pointer-events-none absolute left-2 top-1 pr-2 text-[17px] leading-relaxed text-muted-foreground/70"
                    >
                      {EXAMPLES[placeholder]}
                    </motion.span>
                  </AnimatePresence>
                )}
              </div>

              {dictation.listening && (
                <div className="flex items-center gap-2 px-2 pb-2 text-sm text-volt">
                  <Waveform />
                  <span className="line-clamp-1 text-muted-foreground">{dictation.interim || "Listening…"}</span>
                </div>
              )}

              <AnimatePresence initial={false}>
                {showPostcode && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="mx-1 mb-2 flex items-center gap-2 rounded-2xl bg-surface px-3 py-2.5">
                      <MapPin className="size-4 text-muted-foreground" />
                      <input
                        value={postcode}
                        onChange={(e) => setPostcode(e.target.value.toUpperCase())}
                        placeholder="Postcode (optional)"
                        className="flex-1 bg-transparent text-sm uppercase outline-none placeholder:normal-case placeholder:text-muted-foreground"
                        autoComplete="postal-code"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex items-center gap-1">
                <FilePick label="Take a photo" accept="image/*" capture onFiles={(f) => setPhotos((p) => [...p, ...f])}>
                  <Camera className="size-[18px]" />
                </FilePick>
                <FilePick label="Add photos" accept="image/*" multiple onFiles={(f) => setPhotos((p) => [...p, ...f])}>
                  <ImagePlus className="size-[18px]" />
                </FilePick>
                <FilePick label="Add a floor plan" accept="image/*,application/pdf" multiple onFiles={(f) => setPlans((p) => [...p, ...f])}>
                  <FileText className="size-[18px]" />
                </FilePick>
                <ToolButton label="Postcode" active={showPostcode} onClick={() => setShowPostcode((s) => !s)}>
                  <MapPin className="size-[18px]" />
                </ToolButton>
                <div className="flex-1" />
                {dictation.supported && (
                  <ToolButton
                    label={dictation.listening ? "Stop" : "Talk"}
                    active={dictation.listening}
                    onClick={() => (dictation.listening ? dictation.stop() : dictation.start())}
                    className={cn(dictation.listening && "bg-volt text-black")}
                  >
                    {dictation.listening ? <Square className="size-3.5 fill-current" /> : <Mic className="size-[18px]" />}
                  </ToolButton>
                )}
                <button
                  onClick={analyse}
                  disabled={!hasInput}
                  aria-label="Analyse"
                  className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground transition-all disabled:opacity-30 active:scale-95"
                >
                  <ArrowUp className="size-5" />
                </button>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {EXAMPLES.slice(0, 3).map((e) => (
                <button key={e} onClick={() => setText((t) => (t ? `${t}. ${e}` : e))} className="rounded-full bg-surface px-3 py-1.5 text-xs text-muted-foreground ring-1 ring-hairline transition-colors hover:text-foreground">
                  {e.split(",")[0]}
                </button>
              ))}
            </div>

            <div className="flex-1" />
            <div className="space-y-3 pb-4 pt-8">
              <button
                onClick={analyse}
                disabled={!hasInput}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground transition-all disabled:opacity-30 active:scale-[0.98]"
              >
                Analyse my home <ArrowRight className="size-5" />
              </button>
              <button onClick={() => setText(SAMPLE)} className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline">
                No details to hand? Try a sample home
              </button>
            </div>
          </motion.div>
        )}

        {step === "analysing" && (
          <motion.div key="analysing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-1 flex-col px-5">
            <Analysing photoUrl={photoUrls[0]} hasText={Boolean(text.trim() || voice.length)} hasPlan={plans.length > 0} hasPostcode={Boolean(postcode.trim())} />
          </motion.div>
        )}

        {step === "review" && result && (
          <motion.div key="review" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-1 flex-col">
            <ReviewStep homeId={result.homeId} extraction={result.extraction} onDone={() => router.push("/home")} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Thumb({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <motion.div layout initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative size-20 shrink-0 overflow-hidden rounded-2xl ring-1 ring-hairline">
      {children}
      <button onClick={onRemove} className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-black/60 backdrop-blur" aria-label="Remove">
        <X className="size-3" />
      </button>
    </motion.div>
  );
}

function ToolButton({ label, active, onClick, className, children }: { label: string; active?: boolean; onClick: () => void; className?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn("grid size-10 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground", active && "bg-surface-2 text-foreground", className)}
    >
      {children}
    </button>
  );
}

function FilePick({ label, accept, multiple, capture, onFiles, children }: { label: string; accept: string; multiple?: boolean; capture?: boolean; onFiles: (f: File[]) => void; children: React.ReactNode }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        capture={capture ? "environment" : undefined}
        className="hidden"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <ToolButton label={label} onClick={() => ref.current?.click()}>
        {children}
      </ToolButton>
    </>
  );
}

function Waveform() {
  return (
    <span className="flex h-4 items-center gap-[3px]">
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.span
          key={i}
          className="w-[3px] rounded-full bg-volt"
          animate={{ height: [4, 14, 6, 12, 4] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
}

function Analysing({ photoUrl, hasText, hasPlan, hasPostcode }: { photoUrl?: string; hasText: boolean; hasPlan: boolean; hasPostcode: boolean }) {
  const steps = [
    hasText && { label: "Reading your description", model: "agent" },
    photoUrl && { label: "Looking at the façade", model: "omni" },
    hasPlan && { label: "Measuring the floor plan", model: "omni" },
    hasPostcode && { label: "Matching local EPC records", model: "data" },
    { label: "Classifying walls, roof & glazing", model: "jev" },
    { label: "Checking for conflicts", model: "jev" },
  ].filter(Boolean) as { label: string; model: string }[];
  const [done, setDone] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setDone((d) => Math.min(d + 1, steps.length)), 3200 / steps.length);
    return () => clearInterval(t);
  }, [steps.length]);

  return (
    <div className="flex flex-1 flex-col pt-8">
      <div className="relative mx-auto aspect-[4/5] w-full overflow-hidden rounded-[32px] bg-surface ring-1 ring-hairline">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" className="size-full object-cover opacity-70" />
        ) : (
          <div className="grid size-full place-items-center">
            <div className="size-48 rounded-full bg-volt/15 blur-3xl animate-breathe" />
          </div>
        )}
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_60%,var(--background))]" />
        <div className="absolute inset-0 bg-[linear-gradient(var(--hairline)_1px,transparent_1px),linear-gradient(90deg,var(--hairline)_1px,transparent_1px)] bg-[size:28px_28px] opacity-60" />
        <div className="absolute inset-x-0 top-0 h-1/3 animate-scan bg-[linear-gradient(to_bottom,transparent,color-mix(in_oklch,var(--volt)_35%,transparent),transparent)]" />
        <div className="absolute bottom-5 left-5 right-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-volt">Analysing</p>
          <p className="mt-1 text-2xl font-medium tracking-tight">Building your record…</p>
        </div>
      </div>
      <ul className="mt-6 space-y-3">
        {steps.map((s, i) => (
          <motion.li key={s.label} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }} className="flex items-center gap-3 text-sm">
            <span className={cn("grid size-6 place-items-center rounded-full ring-1", i < done ? "bg-volt text-black ring-volt" : "ring-hairline")}>
              {i < done ? <Check className="size-3.5" strokeWidth={3} /> : i === done ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
            </span>
            <span className={cn("flex-1", i <= done ? "text-foreground" : "text-muted-foreground")}>{s.label}</span>
            <span className="rounded-full bg-surface px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">{s.model}</span>
          </motion.li>
        ))}
      </ul>
      <p className="mt-6 flex items-start gap-2 text-xs text-muted-foreground">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
        Models only classify what they see into fixed categories. Scores and savings are calculated later from your confirmed details.
      </p>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { ArrowRight, ArrowUp, Camera, FileText, ImagePlus, MapPin, Mic, Square, X } from "lucide-react";
import { preloadTwinScene, TwinCanvas } from "@/components/twin/twin-canvas";
import type { TwinSceneProps } from "@/components/twin/scene";
import { useDictation } from "@/hooks/use-dictation";
import { geometryFromRecord } from "@/lib/twin/from-record";
import { MOCK_TWIN } from "@/lib/twin/mock";
import { cn } from "@/lib/utils";
import type { ExtractionResult } from "@/lib/extract/fields";
import { createHome } from "./actions";
import { Analysing } from "./analysing";
import { downscaleImage } from "./downscale";
import { ReviewStep } from "./review-step";
import { partsUpTo } from "./steps";

/** What the shared 3D stage shows; the analysing and review steps drive it. */
export type StageView = Omit<TwinSceneProps, "heatLoss" | "mode" | "children"> & { markers?: ReactNode };

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
  const [step, setStep] = useState<Step>("compose");
  const [text, setText] = useState("");
  const [voice, setVoice] = useState<string[]>([]);
  const [postcode, setPostcode] = useState("");
  const [showPostcode, setShowPostcode] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [plans, setPlans] = useState<File[]>([]);
  const [result, setResult] = useState<{ homeId: string; extraction: ExtractionResult } | null>(null);
  const [view, setView] = useState<StageView | null>(null);
  const [, startTransition] = useTransition();

  // Fetch the 3D chunk while the user is still typing, so the stage appears instantly.
  useEffect(preloadTwinScene, []);
  const toReview = useCallback(() => setStep("review"), []);

  const photoUrls = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos]);
  useEffect(() => () => photoUrls.forEach((u) => URL.revokeObjectURL(u)), [photoUrls]);

  const dictation = useDictation((t) => t && setVoice((v) => [...v, t]));
  const hasInput = Boolean(text.trim() || voice.length || postcode.trim() || photos.length || plans.length);

  async function addPhotos(files: File[]) {
    const small = await Promise.all(files.map((f) => downscaleImage(f)));
    setPhotos((p) => [...p, ...small]);
  }

  function analyse() {
    if (!hasInput) return;
    dictation.stop();
    setResult(null);
    setView({ geometry: geometryFromRecord({}), parts: partsUpTo(0), scan: true, autoRotate: true, interactive: false });
    setStep("analysing");
    const form = new FormData();
    form.set("text", text);
    form.set("voice", voice.join(". "));
    form.set("postcode", postcode);
    photos.forEach((f) => form.append("photos", f));
    plans.forEach((f) => form.append("plans", f));
    startTransition(async () => {
      try {
        const res = await createHome(form);
        if (!res.ok) throw new Error(res.error);
        setResult(res);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
        setStep("compose");
      }
    });
  }

  return (
    <div className={cn("mx-auto flex w-full max-w-md flex-col", step === "compose" ? "min-h-dvh" : "h-dvh overflow-hidden")}>
      <header className={cn("z-20 flex items-center justify-between px-5 pt-safe", step !== "compose" && "absolute inset-x-0 mx-auto max-w-md")}>
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

      {step !== "compose" && view && (
        <div className="relative h-[46dvh] shrink-0 animate-in fade-in duration-500">
          <Stage view={view} />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-[linear-gradient(transparent,var(--background))]" />
        </div>
      )}

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
              <AnimatePresence initial={false}>
                {(photos.length > 0 || plans.length > 0 || voice.length > 0) && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="flex gap-2 overflow-x-auto pb-3 [scrollbar-width:none]">
                      {photos.map((f, i) => (
                        <Thumb key={photoUrls[i]} onRemove={() => setPhotos((p) => p.filter((_, j) => j !== i))}>
                          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
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
                  className="w-full resize-none bg-transparent px-2 pt-1 text-[17px] leading-relaxed outline-none"
                  aria-label="Describe your home"
                />
                {!text && <RotatingPlaceholder />}
              </div>

              {dictation.listening && (
                <div className="flex items-center gap-2 px-2 pb-2 text-sm text-volt">
                  <Waveform />
                  <span className="line-clamp-1 text-muted-foreground">{dictation.interim || "Listening…"}</span>
                </div>
              )}

              {showPostcode && (
                <div className="mx-1 mb-2 flex items-center gap-2 rounded-2xl bg-surface px-3 py-2.5">
                  <MapPin className="size-4 text-muted-foreground" />
                  <input
                    value={postcode}
                    onChange={(e) => setPostcode(e.target.value.toUpperCase())}
                    placeholder="Postcode (optional)"
                    className="flex-1 bg-transparent text-sm uppercase outline-none placeholder:normal-case placeholder:text-muted-foreground"
                    autoComplete="postal-code"
                    autoFocus
                  />
                </div>
              )}

              <div className="flex items-center gap-1">
                <FilePick label="Take a photo" accept="image/*" capture onFiles={addPhotos}>
                  <Camera className="size-[18px]" />
                </FilePick>
                <FilePick label="Add photos" accept="image/*" multiple onFiles={addPhotos}>
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
                  className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground transition-all active:scale-95 disabled:opacity-30"
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
                className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-30"
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
          <motion.div key="analysing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex min-h-0 flex-1 flex-col">
            <Analysing
              result={result?.extraction ?? null}
              text={[text.trim(), ...voice].filter(Boolean).join(". ")}
              photoUrl={photoUrls[0]}
              hasPlan={plans.length > 0}
              onView={setView}
              onDone={toReview}
            />
          </motion.div>
        )}

        {step === "review" && result && (
          <motion.div key="review" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex min-h-0 flex-1 flex-col">
            <ReviewStep homeId={result.homeId} extraction={result.extraction} onView={setView} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Stage({ view: { markers, ...view } }: { view: StageView }) {
  return (
    <TwinCanvas className="absolute inset-0" heatLoss={MOCK_TWIN.heatLoss} mode="normal" {...view}>
      {markers}
    </TwinCanvas>
  );
}

/** Cycles example descriptions. Its own component so the 3 s timer doesn't re-render the whole form. */
function RotatingPlaceholder() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((p) => (p + 1) % EXAMPLES.length), 3200);
    return () => clearInterval(t);
  }, []);
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={i}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        className="pointer-events-none absolute left-2 top-1 pr-2 text-[17px] leading-relaxed text-muted-foreground/70"
      >
        {EXAMPLES[i]}
      </motion.span>
    </AnimatePresence>
  );
}

function Thumb({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <div className="relative size-20 shrink-0 animate-in fade-in zoom-in-90 overflow-hidden rounded-2xl ring-1 ring-hairline">
      {children}
      <button onClick={onRemove} className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-black/60" aria-label="Remove">
        <X className="size-3" />
      </button>
    </div>
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
        <span key={i} className="h-3.5 w-[3px] origin-center animate-pulse rounded-full bg-volt" style={{ animationDelay: `${i * 120}ms` }} />
      ))}
    </span>
  );
}

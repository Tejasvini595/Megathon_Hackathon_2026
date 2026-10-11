"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Camera, Check, FileUp, Loader2, TriangleAlert, X } from "lucide-react";
import type { Finding } from "@/lib/extract/bill-checks";
import type { EnergyUsage } from "@/lib/extract/fields";
import { cn } from "@/lib/utils";
import { readBill, type BillResult } from "../bill-actions";
import { downscaleImage } from "../downscale";
import { UsageChart, type ChartGroup } from "./usage-chart";

const MAX_FILES = 4;
const LETTERS = "JFMAMJJASOND";

function chartGroups(usage: EnergyUsage): ChartGroup[] {
  if (usage.annual) return [{ label: "A year", elec: usage.annual.elecKwh, gas: usage.annual.gasKwh }];
  return (usage.months ?? []).map((m) => {
    const n = Number(m.month.slice(5, 7));
    return { label: LETTERS[n - 1], elec: m.elecKwh, gas: m.gasKwh, winter: [12, 1, 2].includes(n) };
  });
}

const STYLE = {
  ok: { Icon: Check, text: "text-volt" },
  check: { Icon: TriangleAlert, text: "text-amber" },
  reject: { Icon: X, text: "text-ember" },
} as const;

export function Findings({ findings }: { findings: Finding[] }) {
  return (
    <ul className="space-y-1.5">
      {findings.map((f, i) => {
        const { Icon, text } = STYLE[f.level];
        return (
          <li key={i} data-level={f.level} className={cn("flex items-start gap-2 text-xs", text)}>
            <Icon className="mt-px size-3.5 shrink-0" aria-label={f.level === "ok" ? "OK" : f.level === "check" ? "Check" : "Problem"} />
            <span className={f.level === "ok" ? "text-muted-foreground" : undefined}>{f.message}</span>
          </li>
        );
      })}
    </ul>
  );
}

type Props = { heating: string; onUse: (usage: EnergyUsage, source: string) => void };

/** Photograph or upload bills; the server reads the printed numbers, we show them with checks, and the user confirms. */
export function BillUpload({ heating, onUse }: Props) {
  const reduce = useReducedMotion();
  const [files, setFiles] = useState<File[]>([]);
  const [state, setState] = useState<{ phase: "idle" } | { phase: "reading" } | { phase: "failed"; message: string } | { phase: "done"; result: Extract<BillResult, { status: "ok" }> }>({ phase: "idle" });
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  async function add(list: FileList | null, reset: boolean) {
    const added = Array.from(list ?? []);
    if (!added.length) return;
    const all = [...(reset ? [] : files), ...(await Promise.all(added.map((f) => downscaleImage(f))))];
    if (all.length > MAX_FILES) return setState({ phase: "failed", message: `Add up to ${MAX_FILES} files at a time.` });
    setFiles(all);
    setState({ phase: "reading" });
    const form = new FormData();
    all.forEach((f) => form.append("files", f));
    form.set("heating", heating);
    try {
      const r = await readBill(form);
      setState(r.status === "ok" ? { phase: "done", result: r } : { phase: "failed", message: r.message });
    } catch {
      setState({ phase: "failed", message: "Something went wrong reading that. Try again, or type the readings." });
    }
  }

  const reset = () => {
    setFiles([]);
    setState({ phase: "idle" });
  };
  const button = "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium";
  const inputs = (
    <>
      <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Take a photo of a bill" onChange={(e) => { void add(e.target.files, state.phase === "idle" || state.phase === "failed"); e.target.value = ""; }} />
      <input ref={picker} type="file" multiple accept="image/*,application/pdf" className="sr-only" aria-label="Upload bills" onChange={(e) => { void add(e.target.files, state.phase === "idle" || state.phase === "failed"); e.target.value = ""; }} />
    </>
  );
  const spring = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 260, damping: 28 };

  return (
    <section aria-label="Read a bill" className="rounded-2xl bg-volt/10 p-4 ring-1 ring-volt/40">
      {inputs}
      <AnimatePresence mode="wait" initial={false}>
        {state.phase === "reading" ? (
          <motion.div key="reading" role="status" initial={{ opacity: 0, y: reduce ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring} className="flex items-center gap-3 py-3">
            <Loader2 className={cn("size-5 text-volt", !reduce && "animate-spin")} />
            <div>
              <p className="text-sm font-medium">Reading your {files.length === 1 ? "bill" : "bills"}…</p>
              <p className="text-xs text-muted-foreground">Only the numbers are read. Nothing is saved.</p>
            </div>
          </motion.div>
        ) : state.phase === "done" ? (
          <motion.div key="done" initial={{ opacity: 0, y: reduce ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring} className="space-y-3">
            <h4 className="text-sm font-medium">What we read from your {state.result.source}</h4>
            {state.result.usage && <UsageChart groups={chartGroups(state.result.usage)} />}
            <Findings findings={state.result.findings} />
            <div className="flex flex-wrap gap-2">
              <button disabled={!state.result.usage} onClick={() => { onUse(state.result.usage!, state.result.source); reset(); }} className={cn(button, "bg-volt text-black disabled:opacity-40")}>
                Use these readings
              </button>
              {files.length < MAX_FILES && (
                <button onClick={() => picker.current?.click()} className={cn(button, "text-foreground ring-1 ring-hairline")}>
                  Add another bill
                </button>
              )}
              <button onClick={reset} className={cn(button, "text-muted-foreground")}>
                Start over
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={spring}>
            <h4 className="text-sm font-semibold">Don&apos;t know your kWh? Snap your bill.</h4>
            <p className="mt-1 text-xs text-muted-foreground">Photograph or upload a bill or yearly statement (photo or PDF) and we fill in the readings. We only read the numbers; your bill isn&apos;t stored.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => camera.current?.click()} className={cn(button, "bg-volt text-black")}>
                <Camera className="size-4" /> Snap a bill
              </button>
              <button onClick={() => picker.current?.click()} className={cn(button, "text-foreground ring-1 ring-hairline")}>
                <FileUp className="size-4" /> Upload bills
              </button>
            </div>
            {state.phase === "failed" && <p role="alert" className="mt-3 text-xs text-ember">{state.message}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

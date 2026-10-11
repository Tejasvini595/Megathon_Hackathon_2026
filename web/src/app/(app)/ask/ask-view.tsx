"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ArrowUp, Cpu, Mic, ShieldCheck, Square } from "lucide-react";
import { useDictation } from "@/hooks/use-dictation";
import { cn } from "@/lib/utils";
import type { RetrofitId } from "@/lib/twin/types";
import { askHome, type AskReply } from "./actions";

type Msg = { role: "user" | "assistant"; text: string; reply?: AskReply };

const SUGGESTIONS = ["Why this score?", "What if I add solar?", "Skip the heat pump", "What should I do first?"];

/**
 * Voice-first "talk to your house". Each question becomes a typed scenario, the engine re-runs, and the LLM explains
 * only the engine's outputs (checked before they're shown). Follow-ups build on the last scenario.
 */
export function AskView() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [current, setCurrent] = useState<RetrofitId[]>([]);
  const [thinking, startThinking] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const dictation = useDictation((t) => t && send(t));

  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), [messages, thinking]);

  function send(text: string) {
    const q = text.trim();
    if (!q) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    startThinking(async () => {
      try {
        const reply = await askHome(q, current);
        if (reply.scenario) setCurrent(reply.scenario.retrofits);
        setMessages((m) => [...m, { role: "assistant", text: reply.text, reply }]);
      } catch {
        setMessages((m) => [...m, { role: "assistant", text: "Sorry, I couldn't reach the engine. Try again in a moment." }]);
      }
    });
  }

  const empty = messages.length === 0;

  return (
    <div className="flex flex-1 flex-col">

      <AnimatePresence>
        {empty && (
          <motion.div exit={{ opacity: 0, scale: 0.95 }} className="flex flex-1 flex-col items-center justify-center py-10">
            <Orb active={dictation.listening} />
            <p className="mt-10 text-center text-2xl font-medium tracking-tight text-gradient">
              {dictation.listening ? dictation.interim || "Listening…" : "Ask your home anything."}
            </p>
            <p className="mt-2 text-center text-sm text-muted-foreground">Try a what-if. Every number comes from the engine.</p>
          </motion.div>
        )}
      </AnimatePresence>

      {!empty && (
        <div className="flex-1 space-y-4 py-6">
          {messages.map((m, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[85%] rounded-3xl px-4 py-3 text-[15px] leading-relaxed", m.role === "user" ? "rounded-br-lg bg-primary text-primary-foreground" : "rounded-bl-lg bg-surface ring-1 ring-hairline")}>
                {m.reply?.scenario?.after && <ScenarioCard s={m.reply.scenario} />}
                {m.role === "assistant" ? <Prose text={m.text} /> : m.text}
                {m.reply?.note && <p className="mt-2 text-[11px] text-muted-foreground">{m.reply.note}</p>}
                {m.reply && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {m.reply.source === "llm" && (
                      <span className="flex items-center gap-1 rounded-full bg-volt/10 px-2 py-0.5 text-[10px] text-volt">
                        <ShieldCheck className="size-2.5" /> numbers from the engine
                      </span>
                    )}
                    {m.reply.trace.map((t) => (
                      <span key={t} className="flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                        <Cpu className="size-2.5" />
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
          {thinking && (
            <div className="flex gap-1 px-2">
              {[0, 1, 2].map((i) => (
                <motion.span key={i} className="size-2 rounded-full bg-muted-foreground" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }} />
              ))}
            </div>
          )}
          <div ref={bottom} />
        </div>
      )}

      <div className="fixed inset-x-0 bottom-24 z-30 mx-auto max-w-md px-4">
        {empty && (
          <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => send(s)} className="glass shrink-0 rounded-full px-3.5 py-2 text-sm">
                {s}
              </button>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="glass flex items-center gap-2 rounded-full p-1.5 pl-4 shadow-2xl shadow-black/40"
        >
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="What if I…" className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground" />
          {dictation.supported && (
            <button
              type="button"
              onClick={() => (dictation.listening ? dictation.stop() : dictation.start())}
              aria-label={dictation.listening ? "Stop" : "Speak"}
              className={cn("grid size-10 place-items-center rounded-full", dictation.listening ? "bg-volt text-black" : "text-muted-foreground hover:bg-surface-2")}
            >
              {dictation.listening ? <Square className="size-3.5 fill-current" /> : <Mic className="size-[18px]" />}
            </button>
          )}
          <button type="submit" disabled={!input.trim()} aria-label="Send" className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-30">
            <ArrowUp className="size-5" />
          </button>
        </form>
      </div>
    </div>
  );
}

const kwh = (n: number) => `${n < 0 ? "+" : "−"}${Math.abs(Math.round(n)).toLocaleString("en-GB")} kWh`;

/** The engine's before -> after for the scenario, shown before the words. */
function ScenarioCard({ s }: { s: NonNullable<AskReply["scenario"]> }) {
  const a = s.after!;
  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="mb-3 rounded-2xl bg-surface-2 p-3 ring-1 ring-hairline">
      <p className="text-[11px] text-muted-foreground">{s.labels.join(" · ")}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="tabular text-2xl font-semibold">{s.before.score}</span>
        <ArrowRight className="size-4 text-muted-foreground" />
        <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }} className="tabular text-2xl font-semibold text-volt">
          {a.score}
        </motion.span>
        <span className="text-xs text-muted-foreground">{a.scoreClass}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
        <span><span className="block text-muted-foreground">Gas</span><span className="tabular">{kwh(-a.gasSavingKwh.p50)}</span></span>
        <span><span className="block text-muted-foreground">Electricity</span><span className="tabular">{kwh(-a.elecSavingKwh.p50)}</span></span>
        <span><span className="block text-muted-foreground">Bills</span><span className="tabular">{a.billSavingGbp >= 0 ? "−" : "+"}£{Math.abs(a.billSavingGbp).toLocaleString("en-GB")}/yr</span></span>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">Engine estimates, not guarantees.</p>
    </motion.div>
  );
}

/** Paragraphs and **bold**, which is all the explanations use. */
function Prose({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i}>{para.split(/(\*\*[^*]+\*\*)/).map((t, j) => (t.startsWith("**") ? <strong key={j}>{t.slice(2, -2)}</strong> : t))}</p>
      ))}
    </div>
  );
}

function Orb({ active }: { active: boolean }) {
  return (
    <div className="relative grid size-56 place-items-center">
      {/* Gradient halo instead of a blur filter: animating a filtered layer is expensive on phones. */}
      <motion.div
        className="absolute -inset-10 rounded-full bg-[radial-gradient(circle,color-mix(in_oklch,var(--volt)_35%,transparent)_30%,color-mix(in_oklch,var(--frost)_18%,transparent)_50%,transparent_70%)]"
        animate={{ scale: active ? [1, 1.12, 1] : 1 }}
        transition={{ duration: 1.2, repeat: Infinity }}
      />
      <motion.div
        className="absolute inset-6 rounded-full bg-[conic-gradient(from_180deg,var(--frost),var(--volt),#c8fff0,var(--frost))]"
        animate={{ rotate: -360 }}
        transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
      />
      <div className="absolute inset-[30px] rounded-full bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,0.55),transparent_45%),radial-gradient(circle,rgba(11,13,16,0.15),rgba(11,13,16,0.6))]" />
      <Mic className={cn("relative size-8 text-white/90 transition-transform", active && "scale-110")} />
    </div>
  );
}

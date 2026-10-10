"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Cpu, Mic, Square } from "lucide-react";
import { useDictation } from "@/hooks/use-dictation";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; text: string; trace?: string[] };

const SUGGESTIONS = ["Why is my score 38?", "What if I add solar?", "Skip the heat pump", "What should I do first?"];

/**
 * Voice-first "talk to your house". Flow once wired: decision model parses the request into a typed
 * scenario -> feasibility rules -> engine reruns -> LLM explains the computed diff -> grounding check.
 * The reply below is a placeholder that shows the shape of that pipeline.
 */
export function AskView({ nickname }: { nickname: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const dictation = useDictation((t) => t && send(t));

  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), [messages, thinking]);

  function send(text: string) {
    const q = text.trim();
    if (!q) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setThinking(true);
    setTimeout(() => {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: "I'll answer this once the engine is connected. I only explain numbers the engine has calculated for your home, never my own estimates.",
          trace: ["parse → scenario", "feasibility rules", "engine rerun", "explain", "grounding check"],
        },
      ]);
      setThinking(false);
    }, 900);
  }

  const empty = messages.length === 0;

  return (
    <div className="flex min-h-dvh flex-col px-5 pt-safe pb-44">
      <header className="pt-3">
        <p className="text-xs text-muted-foreground">Talking to</p>
        <h1 className="text-xl font-semibold tracking-tight">{nickname}</h1>
      </header>

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
                {m.text}
                {m.trace && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {m.trace.map((t) => (
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

function Orb({ active }: { active: boolean }) {
  return (
    <div className="relative grid size-56 place-items-center">
      <motion.div
        className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,var(--volt),var(--frost),#7c5cff,var(--volt))] opacity-60 blur-2xl"
        animate={{ rotate: 360, scale: active ? [1, 1.15, 1] : 1 }}
        transition={{ rotate: { duration: 12, repeat: Infinity, ease: "linear" }, scale: { duration: 1.2, repeat: Infinity } }}
      />
      <motion.div
        className="absolute inset-6 rounded-full bg-[conic-gradient(from_180deg,var(--frost),var(--volt),#c8fff0,var(--frost))]"
        animate={{ rotate: -360 }}
        transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
      />
      <div className="absolute inset-[30px] rounded-full bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,0.55),transparent_45%),radial-gradient(circle,rgba(11,13,16,0.15),rgba(11,13,16,0.6))] backdrop-blur-xl" />
      <Mic className={cn("relative size-8 text-white/90 transition-transform", active && "scale-110")} />
    </div>
  );
}

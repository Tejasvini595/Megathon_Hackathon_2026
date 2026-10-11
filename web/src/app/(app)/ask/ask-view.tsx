"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { ArrowRight, ArrowUp, Brain, Check, Cpu, History, Loader2, Mic, Pencil, ShieldCheck, Square, SquarePen } from "lucide-react";
import { useDictation } from "@/hooks/use-dictation";
import { cn } from "@/lib/utils";
import { askHome, listChats, rememberFromAsk, type AskReply, type ChatSummary, type ChatTurn } from "./actions";
import { ChatHistory } from "./chat-history";

const SUGGESTIONS = ["Why this score?", "What if I add solar?", "We rent, so skip the heat pump", "Can I afford the plan?"];

/** Shown before the server has saved a message; such messages can't be edited yet. */
const local = (role: ChatTurn["role"], text: string): ChatTurn => ({ id: `local-${role}`, role, text });

/**
 * Voice-first "talk to your house". Each question becomes a typed scenario, the engine re-runs, and the LLM explains
 * only the engine's outputs (checked before they're shown). Follow-ups build on the last scenario. Chats are saved per
 * home; editing a question drops everything after it and asks again.
 */
export function AskView({ homeId, homeName, chatId, initial }: { homeId: string; homeName: string; chatId: string | null; initial: ChatTurn[] }) {
  const router = useRouter();
  const [chat, setChat] = useState(chatId);
  const [messages, setMessages] = useState(initial);
  const [input, setInput] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [thinking, startThinking] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  // The transcript lands in the input to check before sending: an audio model can mishear.
  const dictation = useDictation((t) => {
    setInput((v) => (v ? `${v} ${t}` : t).slice(0, 500));
    field.current?.focus();
  });

  // Opening another chat (history, back/forward) brings new props. A refresh of the chat already on screen (the URL
  // it was given after its first answer, or a revalidation) keeps the local state.
  const [shown, setShown] = useState(chatId);
  if (chatId !== shown) {
    setShown(chatId);
    if (chatId !== chat) {
      setChat(chatId);
      setMessages(initial);
      setEditing(null);
    }
  }

  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), [messages, thinking]);

  function send(text: string, editOf?: string) {
    const q = text.trim();
    if (!q || thinking) return;
    const kept = editOf ? messages.slice(0, messages.findIndex((m) => m.id === editOf)) : messages;
    setInput("");
    setEditing(null);
    setMessages([...kept, local("user", q)]);
    startThinking(async () => {
      try {
        const res = await askHome(homeId, q, { chat: chat ?? undefined, editOf });
        setMessages([...kept, res.question, res.answer]);
        if (!chat) {
          setChat(res.chatId);
          // Same view, now addressable: no remount, and a reload reopens this chat.
          window.history.replaceState(null, "", `/ask/${homeId}/${res.chatId}`);
        }
      } catch {
        setMessages([...kept, local("user", q), local("assistant", "Sorry, I couldn't reach the engine. Try again in a moment.")]);
      }
    });
  }

  function newChat() {
    setMessages([]);
    setChat(null);
    setEditing(null);
    setInput("");
    setHistoryOpen(false);
    router.push(`/ask/${homeId}`);
  }

  function openHistory() {
    setHistoryOpen(true);
    listChats(homeId).then(setChats, () => setChats([]));
  }

  const empty = messages.length === 0;

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center gap-1 pt-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">Talking to</p>
          <h1 className="truncate text-xl font-semibold tracking-tight">{homeName}</h1>
        </div>
        <button onClick={openHistory} aria-label="Your chats" className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground">
          <History className="size-[18px]" />
        </button>
        <button onClick={newChat} disabled={thinking || (empty && !chat)} aria-label="New chat" className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground disabled:opacity-30">
          <SquarePen className="size-[18px]" />
        </button>
      </header>

      <AnimatePresence>
        {empty && (
          <motion.div exit={{ opacity: 0, scale: 0.95 }} className="flex flex-1 flex-col items-center justify-center py-10">
            <Orb active={dictation.listening} />
            <p className="mt-10 text-center text-2xl font-medium tracking-tight text-gradient">{dictation.interim || "Ask your home anything."}</p>
            <p className="mt-2 text-center text-sm text-muted-foreground">Try a what-if. Every number comes from the engine.</p>
          </motion.div>
        )}
      </AnimatePresence>

      {!empty && (
        <div className="flex-1 space-y-4 py-6">
          {messages.map((m, i) => (
            <motion.div key={`${i}:${m.id}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn("flex flex-col", m.role === "user" ? "items-end" : "items-start")}>
              {editing?.id === m.id ? (
                <EditBox text={editing.text} busy={thinking} onChange={(text) => setEditing({ id: m.id, text })} onCancel={() => setEditing(null)} onSubmit={() => send(editing.text, m.id)} />
              ) : (
                <div className={cn("max-w-[85%] rounded-3xl px-4 py-3 text-[15px] leading-relaxed", m.role === "user" ? "rounded-br-lg bg-primary text-primary-foreground" : "rounded-bl-lg bg-surface ring-1 ring-hairline")}>
                  {m.reply?.scenario?.after && <ScenarioCard s={m.reply.scenario} />}
                  {m.role === "assistant" ? <Prose text={m.text} /> : m.text}
                  {m.reply?.note && <p className="mt-2 text-[11px] text-muted-foreground">{m.reply.note}</p>}
                  {m.reply?.memory && <RememberChips homeId={homeId} s={m.reply.memory} said={messages[i - 1]?.text ?? ""} />}
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
              )}
              {m.role === "user" && !m.id.startsWith("local-") && editing?.id !== m.id && !thinking && (
                <button onClick={() => setEditing({ id: m.id, text: m.text })} className="mt-1 flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                  <Pencil className="size-3" /> Edit
                </button>
              )}
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
          <input ref={field} value={input} onChange={(e) => setInput(e.target.value)} maxLength={500} placeholder={dictation.interim || "What if I…"} className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground" />
          {dictation.supported && (
            <button
              type="button"
              disabled={dictation.transcribing || thinking}
              onClick={() => (dictation.listening ? dictation.stop() : dictation.start())}
              aria-label={dictation.listening ? "Stop" : dictation.transcribing ? "Transcribing" : "Speak"}
              className={cn("grid size-10 place-items-center rounded-full disabled:opacity-60", dictation.listening ? "bg-volt text-black" : "text-muted-foreground hover:bg-surface-2")}
            >
              {dictation.listening ? <Square className="size-3.5 fill-current" /> : dictation.transcribing ? <Loader2 className="size-[18px] animate-spin" /> : <Mic className="size-[18px]" />}
            </button>
          )}
          <button type="submit" disabled={!input.trim() || thinking} aria-label="Send" className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-30">
            <ArrowUp className="size-5" />
          </button>
        </form>
      </div>

      <ChatHistory
        open={historyOpen}
        homeId={homeId}
        chats={chats}
        current={chat}
        onClose={() => setHistoryOpen(false)}
        onRemoved={(id) => {
          setChats((cs) => cs?.filter((c) => c.id !== id) ?? null);
          if (id === chat) newChat();
        }}
      />
    </div>
  );
}

/** Editing a sent question in place; asking again replaces everything after it. */
function EditBox({ text, busy, onChange, onCancel, onSubmit }: { text: string; busy: boolean; onChange: (t: string) => void; onCancel: () => void; onSubmit: () => void }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="w-[85%] rounded-3xl rounded-br-lg bg-surface-2 p-3 ring-1 ring-hairline"
    >
      <textarea
        autoFocus
        value={text}
        maxLength={500}
        rows={Math.min(5, Math.ceil(text.length / 32) || 1)}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => e.currentTarget.setSelectionRange(text.length, text.length)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (text.trim()) onSubmit();
          }
          if (e.key === "Escape") onCancel();
        }}
        aria-label="Edit your question"
        className="w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none"
      />
      <p className="mt-1 text-[11px] text-muted-foreground">Asking again replaces the answers after this question.</p>
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-full px-3 py-1.5 text-xs text-muted-foreground hover:bg-surface">
          Cancel
        </button>
        <button type="submit" disabled={!text.trim() || busy} className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-30">
          Ask again
        </button>
      </div>
    </form>
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

function memoryLabels(s: NonNullable<AskReply["memory"]>) {
  const name = (id: string) => id.replaceAll("_", " ");
  return [
    ...s.completed.map((id) => `${name(id)} done`),
    ...Object.keys(s.declined).map((id) => `no ${name(id)}`),
    ...(s.renting ? ["you rent"] : []),
    ...(s.listed ? ["listed building"] : []),
    ...(s.budget_gbp != null ? [`budget £${s.budget_gbp.toLocaleString("en-GB")}`] : []),
    ...(s.priority ? [s.priority === "carbon" ? "carbon first" : "cost first"] : []),
  ];
}

/** Facts spotted in the message, remembered only if the user says so; the plan then adapts. */
function RememberChips({ homeId, s, said }: { homeId: string; s: NonNullable<AskReply["memory"]>; said: string }) {
  const [state, setState] = useState<"ask" | "saving" | "saved" | "dismissed">("ask");
  if (state === "dismissed") return null;
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-3 rounded-2xl bg-volt/5 p-3 ring-1 ring-volt/20">
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-volt">
        <Brain className="size-3" /> {state === "saved" ? "Remembered" : "Remember this for your plan?"}
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        {memoryLabels(s).map((l) => (
          <span key={l} className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px]">
            {l}
          </span>
        ))}
      </div>
      {state === "saved" ? (
        <Link href={`/plan/${homeId}`} className="mt-2 inline-flex items-center gap-1 text-[11px] text-volt underline-offset-2 hover:underline">
          <Check className="size-3" /> See how your plan changed
        </Link>
      ) : (
        <div className="mt-2 flex gap-2">
          <button
            disabled={state === "saving"}
            onClick={async () => {
              setState("saving");
              await rememberFromAsk(homeId, s, said);
              setState("saved");
            }}
            className="rounded-full bg-volt px-3 py-1 text-[11px] font-semibold text-black disabled:opacity-50"
          >
            Remember
          </button>
          <button onClick={() => setState("dismissed")} className="rounded-full px-3 py-1 text-[11px] text-muted-foreground hover:bg-surface-2">
            Not now
          </button>
        </div>
      )}
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

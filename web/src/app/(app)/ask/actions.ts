"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { getAnalysis, runEngine } from "@/lib/engine";
import { detectMemory, type MemorySuggestion } from "@/lib/llm/memory-notes";
import { parseMemory, RETROFIT_LABEL, retrofitId } from "@/lib/memory";
import { prisma } from "@/lib/prisma";
import { HOME_SECTIONS } from "@/lib/active-home";
import { requireUser } from "@/lib/dal";
import { explain, parseQuestion } from "@/lib/llm/ask";
import type { Band, RetrofitId, ScoreClass } from "@/lib/twin/types";

const RETROFIT_IDS = ["loft_insulation", "cavity_wall_insulation", "solid_wall_insulation", "floor_insulation", "double_glazing", "smart_thermostat", "heat_pump", "solar_pv", "condensing_boiler"] as const;
const input = z.object({ question: z.string().trim().min(1).max(500), current: z.array(z.enum(RETROFIT_IDS)).max(9) });

/** Re-checks the session; null unless the home belongs to the signed-in user. */
async function ownedHome(id: string) {
  const user = await requireUser();
  return prisma.home.findFirst({ where: { id: z.string().min(1).max(64).parse(id), userId: user.id } });
}

export type AskReply = {
  text: string;
  source: "llm" | "template";
  /** Something the user should know about their question, in plain words (e.g. a measure we can't model). */
  notice: string | null;
  /** The scenario the engine ran (what the next question builds on), with its computed results. */
  scenario: {
    retrofits: RetrofitId[];
    labels: string[];
    before: { score: number; scoreClass: ScoreClass };
    after: { score: number; scoreClass: ScoreClass; gasSavingKwh: Band; elecSavingKwh: Band; carbonSavingKg: Band; billSavingGbp: number } | null;
  } | null;
  /** How the answer was made, in plain words, for the "How we got this answer" section. Missing on replies saved before it existed. */
  steps?: string[];
  /** Facts about the home or the customer spotted in the message, for the user to confirm before they're remembered. */
  memory: MemorySuggestion | null;
};

export type ChatTurn = { id: string; role: "user" | "assistant"; text: string; reply?: AskReply };
export type ChatSummary = { id: string; title: string; updatedAt: string };
export type AskResult = { chatId: string; question: ChatTurn; answer: ChatTurn };

const id = z.string().min(1).max(64);
const title = (q: string) => (q.length > 60 ? `${q.slice(0, 57).trimEnd()}…` : q);

/** The chat, only if it belongs to one of the signed-in user's homes. */
async function ownedChat(homeId: string, chatId: string) {
  const home = await ownedHome(homeId);
  return home && prisma.chat.findFirst({ where: { id: id.parse(chatId), homeId: home.id } });
}

/** Most recent first, for the chat list. */
export async function listChats(homeId: string): Promise<ChatSummary[]> {
  const home = await ownedHome(homeId);
  if (!home) return [];
  const chats = await prisma.chat.findMany({ where: { homeId: home.id }, orderBy: { updatedAt: "desc" }, take: 100, select: { id: true, title: true, updatedAt: true } });
  return chats.map((c) => ({ ...c, updatedAt: c.updatedAt.toISOString() }));
}

/** The chat's messages in order; null when it doesn't exist or isn't the user's. */
export async function getChat(homeId: string, chatId: string): Promise<ChatTurn[] | null> {
  const chat = await ownedChat(homeId, chatId);
  if (!chat) return null;
  const rows = await prisma.chatMessage.findMany({ where: { chatId: chat.id }, orderBy: { createdAt: "asc" } });
  return rows.map((m) => ({ id: m.id, role: m.role === "USER" ? "user" : "assistant", text: m.content, ...(m.reply != null && { reply: m.reply as unknown as AskReply }) }));
}

export async function deleteChat(homeId: string, chatId: string): Promise<void> {
  const chat = await ownedChat(homeId, chatId);
  if (chat) await prisma.chat.delete({ where: { id: chat.id } });
}

/**
 * One turn of a chat, saved on both sides. Without `chat` it starts a new one; with `editOf` it replaces that user
 * message and everything after it. Follow-ups build on the scenario of the last answer still in the chat.
 */
export async function askHome(homeId: string, question: string, opts: { chat?: string; editOf?: string } = {}): Promise<AskResult> {
  const q = input.shape.question.parse(question);
  const home = await ownedHome(homeId);
  if (!home) throw new Error("Home not found");

  let chat = opts.chat ? await ownedChat(homeId, opts.chat) : null;
  if (opts.chat && !chat) throw new Error("Chat not found");
  if (chat && opts.editOf) {
    const edited = await prisma.chatMessage.findFirst({ where: { id: id.parse(opts.editOf), chatId: chat.id, role: "USER" } });
    if (!edited) throw new Error("Message not found");
    await prisma.chatMessage.deleteMany({ where: { chatId: chat.id, createdAt: { gte: edited.createdAt } } });
  }
  chat ??= await prisma.chat.create({ data: { homeId: home.id, title: title(q) } });

  const last = await prisma.chatMessage.findFirst({ where: { chatId: chat.id, role: "ASSISTANT" }, orderBy: { createdAt: "desc" } });
  const current = input.shape.current.catch([]).parse((last?.reply as AskReply | null)?.scenario?.retrofits ?? []);
  const asked = await prisma.chatMessage.create({ data: { chatId: chat.id, role: "USER", content: q } });

  let reply: AskReply;
  try {
    reply = await answer(home, q, current);
  } catch (e) {
    console.error("Ask failed", e instanceof Error ? e.message : e);
    reply = { text: "Sorry, I couldn't reach the engine. Try again in a moment.", source: "template", notice: null, scenario: null, steps: [], memory: null };
  }
  const answered = await prisma.chatMessage.create({ data: { chatId: chat.id, role: "ASSISTANT", content: reply.text, reply: reply as unknown as Prisma.InputJsonValue } });
  // Bumps the chat to the top of the list; an edited first question renames it.
  await prisma.chat.update({ where: { id: chat.id }, data: { updatedAt: new Date(), ...(!last && { title: title(q) }) } });
  return { chatId: chat.id, question: { id: asked.id, role: "user", text: q }, answer: { id: answered.id, role: "assistant", text: reply.text, reply } };
}

/** What-if: parse the question into a typed scenario, re-run the engine, then let the LLM explain only the engine's outputs. */
async function answer(home: NonNullable<Awaited<ReturnType<typeof ownedHome>>>, q: string, cur: RetrofitId[]): Promise<AskReply> {
  if (!home.record) return { text: "Add your home first, then ask me anything about it.", source: "template", notice: null, scenario: null, steps: [], memory: null };

  const base = await getAnalysis(home);
  if (!base) return { text: "The engine isn't reachable right now, so I can't answer with real numbers. Try again in a moment.", source: "template", notice: null, scenario: null, steps: [], memory: null };
  const [parsed, memory] = await Promise.all([parseQuestion(q, cur), detectMemory(q).catch(() => null)]);
  const names = (ids: RetrofitId[]) => ids.map((id) => RETROFIT_LABEL[id].toLowerCase()).join(", ").replace(/, ([^,]*)$/, " and $1");
  const steps = [parsed.retrofits.length ? `We read your question as a what-if: your home with ${names(parsed.retrofits)}.` : "We answered from your home as it is today."];

  let ctx = base.llm;
  let scenario: AskReply["scenario"] = null;
  if (parsed.retrofits.length) {
    const run = await runEngine(home, parsed.retrofits);
    if (!run) return { text: "The engine couldn't re-run that scenario. Try again in a moment.", source: "template", notice: null, scenario: null, steps, memory: null };
    steps.push(run.twin.package ? "We recalculated your home's score, energy use, carbon and value with that change." : "That change can't be made to this home, so there was nothing to recalculate.");
    ctx = run.llm;
    const p = run.twin.package;
    scenario = {
      retrofits: parsed.retrofits,
      labels: run.twin.retrofits.map((r) => r.label),
      before: { score: base.twin.score, scoreClass: base.twin.scoreClass },
      after: p && { score: p.scoreAfter, scoreClass: p.classAfter, gasSavingKwh: p.gasSavingKwh, elecSavingKwh: p.elecSavingKwh, carbonSavingKg: p.carbonSavingKg, billSavingGbp: p.billSavingGbp },
    };
  }
  const ex = await explain(q, ctx);
  steps.push(
    ex.source === "llm"
      ? "AI wrote the wording. Every number in it was filled in by our calculations and checked before you saw it."
      : "This is our standard summary, so every number comes straight from our calculations.",
  );
  const u = parsed.unsupported;
  const notice = u.length ? `We can't model ${u.join(", ")} yet, so ${u.length > 1 ? "they were" : "it was"} left out of this answer.` : null;
  return { text: ex.text, source: ex.source, notice, scenario, steps, memory };
}

const suggestion = z.object({
  completed: z.array(retrofitId).max(9),
  declined: z.partialRecord(retrofitId, z.string().max(200)),
  renting: z.literal(true).optional(),
  listed: z.literal(true).optional(),
  budget_gbp: z.number().int().min(0).max(100_000).optional(),
  priority: z.enum(["carbon", "cost"]).optional(),
});

/** Saves the facts the user confirmed from an Ask message into the home's memory; the plan adapts on its next load. */
export async function rememberFromAsk(homeId: string, input: z.input<typeof suggestion>, said: string): Promise<{ saved: string[] }> {
  const s = suggestion.parse(input);
  const quote = z.string().trim().max(160).parse(said);
  const home = await ownedHome(homeId);
  if (!home) return { saved: [] };
  const m = parseMemory(home.memory);
  const saved: string[] = [];
  const name = (id: string) => id.replaceAll("_", " ");
  for (const id of s.completed) if (!m.completed.includes(id)) { m.completed.push(id); delete m.declined[id]; saved.push(`${name(id)} already done`); }
  for (const [id, why] of Object.entries(s.declined) as [z.infer<typeof retrofitId>, string][]) { m.declined[id] = why; m.completed = m.completed.filter((c) => c !== id); saved.push(`no ${name(id)}`); }
  if (s.renting && !m.renting) { m.renting = true; saved.push("you rent"); }
  if (s.listed && !m.listed) { m.listed = true; saved.push("listed / conservation area"); }
  if (s.budget_gbp != null && s.budget_gbp !== m.budget_gbp) { m.budget_gbp = s.budget_gbp; saved.push(`budget £${s.budget_gbp.toLocaleString("en-GB")}`); }
  if (s.priority && s.priority !== m.priority) { m.priority = s.priority; saved.push(s.priority === "carbon" ? "carbon first" : "cost first"); }
  if (!saved.length) return { saved };
  m.log = [...m.log, { at: new Date().toISOString(), text: `From Ask ("${quote}"): ${saved.join(", ")}.`.slice(0, 300) }].slice(-100);
  await prisma.home.update({ where: { id: home.id }, data: { memory: m as unknown as Prisma.InputJsonValue } });
  for (const section of HOME_SECTIONS) if (section !== "ask") revalidatePath(`/${section}/${home.id}`);
  return { saved };
}

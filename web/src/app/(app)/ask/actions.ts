"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { getAnalysis, runEngine } from "@/lib/engine";
import { detectMemory, type MemorySuggestion } from "@/lib/llm/memory-notes";
import { parseMemory, retrofitId } from "@/lib/memory";
import { prisma } from "@/lib/prisma";
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
  note: string | null;
  /** The scenario the engine ran (what the next question builds on), with its computed results. */
  scenario: {
    retrofits: RetrofitId[];
    labels: string[];
    before: { score: number; scoreClass: ScoreClass };
    after: { score: number; scoreClass: ScoreClass; gasSavingKwh: Band; elecSavingKwh: Band; carbonSavingKg: Band; billSavingGbp: number } | null;
  } | null;
  trace: string[];
  /** Facts about the home or the customer spotted in the message, for the user to confirm before they're remembered. */
  memory: MemorySuggestion | null;
};

/** What-if: parse the question into a typed scenario, re-run the engine, then let the LLM explain only the engine's outputs. */
export async function askHome(homeId: string, question: string, current: RetrofitId[] = []): Promise<AskReply> {
  const { question: q, current: cur } = input.parse({ question, current });
  const home = await ownedHome(homeId);
  if (!home?.record) return { text: "Add your home first, then ask me anything about it.", source: "template", note: null, scenario: null, trace: [], memory: null };

  const base = await getAnalysis(home);
  if (!base) return { text: "The engine isn't reachable right now, so I can't answer with real numbers. Try again in a moment.", source: "template", note: null, scenario: null, trace: [], memory: null };
  const [parsed, memory] = await Promise.all([parseQuestion(q, cur), detectMemory(q).catch(() => null)]);
  const trace = [`read as ${parsed.kind === "scenario" ? "a what-if" : "a question"} (${parsed.source === "llm" ? "AI" : "rules"})`];

  let ctx = base.llm;
  let scenario: AskReply["scenario"] = null;
  if (parsed.retrofits.length) {
    const run = await runEngine(home, parsed.retrofits);
    if (!run) return { text: "The engine couldn't re-run that scenario. Try again in a moment.", source: "template", note: null, scenario: null, trace, memory: null };
    trace.push(`engine re-ran ${parsed.retrofits.length} measure${parsed.retrofits.length > 1 ? "s" : ""}`);
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
  trace.push(ex.source === "llm" ? "AI explanation, numbers checked" : "standard explanation");
  const note = [parsed.note, ex.note].filter(Boolean).join(" ") || null;
  if (memory) trace.push(`noticed something to remember (${memory.source})`);
  return { text: ex.text, source: ex.source, note, scenario, trace, memory };
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
  revalidatePath(`/plan/${home.id}`);
  return { saved };
}

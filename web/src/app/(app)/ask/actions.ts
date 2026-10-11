"use server";

import { z } from "zod";
import { getAnalysis, runEngine } from "@/lib/engine";
import { getActiveHomeRow } from "@/lib/homes";
import { explain, parseQuestion } from "@/lib/llm/ask";
import type { Band, RetrofitId, ScoreClass } from "@/lib/twin/types";

const RETROFIT_IDS = ["loft_insulation", "cavity_wall_insulation", "solid_wall_insulation", "floor_insulation", "double_glazing", "smart_thermostat", "heat_pump", "solar_pv", "condensing_boiler"] as const;
const input = z.object({ question: z.string().trim().min(1).max(500), current: z.array(z.enum(RETROFIT_IDS)).max(9) });

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
};

/** What-if: parse the question into a typed scenario, re-run the engine, then let the LLM explain only the engine's outputs. */
export async function askHome(question: string, current: RetrofitId[] = []): Promise<AskReply> {
  const { question: q, current: cur } = input.parse({ question, current });
  const { home } = await getActiveHomeRow();
  if (!home?.record) return { text: "Add your home first, then ask me anything about it.", source: "template", note: null, scenario: null, trace: [] };

  const base = await getAnalysis(home);
  if (!base) return { text: "The engine isn't reachable right now, so I can't answer with real numbers. Try again in a moment.", source: "template", note: null, scenario: null, trace: [] };
  const parsed = await parseQuestion(q, cur);
  const trace = [`read as ${parsed.kind === "scenario" ? "a what-if" : "a question"} (${parsed.source === "llm" ? "AI" : "rules"})`];

  let ctx = base.llm;
  let scenario: AskReply["scenario"] = null;
  if (parsed.retrofits.length) {
    const run = await runEngine(home, parsed.retrofits);
    if (!run) return { text: "The engine couldn't re-run that scenario. Try again in a moment.", source: "template", note: null, scenario: null, trace };
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
  return { text: ex.text, source: ex.source, note, scenario, trace };
}

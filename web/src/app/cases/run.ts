import "server-only";
import { engineJson, placeOf } from "@/lib/engine";
import { engineResponseSchema, type EngineResponse } from "@/lib/twin/schema";
import type { RetrofitId } from "@/lib/twin/types";
import type { EdgeCase } from "./data";

export type CaseRun = { twin: EngineResponse["twin"]; alone: EngineResponse["twin"] | null };

async function ask(c: EdgeCase, retrofits: RetrofitId[] | null) {
  const postcode = c.record.postcode;
  const res = await engineJson<unknown>("/twin", { record: c.record, place: await placeOf(typeof postcode === "string" ? postcode : null), retrofits });
  const parsed = res ? engineResponseSchema.safeParse(res) : null;
  return parsed?.success ? parsed.data.twin : null;
}

/** Runs the engine live on a case's home; null when the engine can't be reached. */
export async function runCase(c: EdgeCase): Promise<CaseRun | null> {
  const [twin, alone] = await Promise.all([ask(c, c.scenario), c.alone ? ask(c, [c.alone]) : null]);
  return twin && { twin, alone };
}

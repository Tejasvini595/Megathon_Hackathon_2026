import "server-only";
import { engineJson } from "@/lib/engine";
import { RETROFIT_IDS } from "@/lib/memory";
import type { RetrofitId } from "@/lib/twin/types";
import { decide, decisionThreshold } from "./decide";

/**
 * Memory facts in an Ask message ("we already did the loft", "we rent", "no heat pump, too disruptive", "budget 5k").
 * The decision model judges each measure and constraint with a probability; only confident facts are suggested, and the
 * user confirms them before anything is saved. Without a decision model, the engine's transparent rules do it.
 */
export type MemorySuggestion = {
  completed: RetrofitId[];
  declined: Partial<Record<RetrofitId, string>>;
  renting?: true;
  listed?: true;
  budget_gbp?: number;
  priority?: "carbon" | "cost";
  source: "decision model" | "rules";
};

type Rules = { completed: RetrofitId[]; declined: Partial<Record<RetrofitId, string>>; renting: boolean | null; listed: boolean | null; budget_gbp: number | null; priority: "carbon" | "cost" | null };

const LABELS: Record<RetrofitId, string> = {
  loft_insulation: "loft insulation", cavity_wall_insulation: "cavity wall insulation", solid_wall_insulation: "solid wall insulation",
  floor_insulation: "floor insulation", double_glazing: "double glazing", smart_thermostat: "a smart thermostat or zoned controls",
  heat_pump: "a heat pump", solar_pv: "solar panels", condensing_boiler: "a new condensing boiler",
};

const empty = (s: MemorySuggestion) => !s.completed.length && !Object.keys(s.declined).length && !s.renting && !s.listed && s.budget_gbp == null && !s.priority;

export async function detectMemory(text: string): Promise<MemorySuggestion | null> {
  const rules = await engineJson<Rules>("/memory/parse", { text });
  const questions = {
    ...Object.fromEntries(
      RETROFIT_IDS.map((id) => [
        id,
        {
          type: "choice" as const,
          instructions: `Does the homeowner say anything about ${LABELS[id]}?`,
          criteria: { not_mentioned: "Not mentioned, or only asked about hypothetically (\"what if...\")", done: "They already have it or it has been done", not_wanted: "They don't want it or can't do it" },
        },
      ]),
    ),
    renting: { type: "boolean" as const, instructions: "Does the homeowner say they rent the home (are a tenant)?", criteria: { true: "They rent", false: "They own it or don't say" } },
    listed: { type: "boolean" as const, instructions: "Is the home said to be a listed building or in a conservation area?", criteria: { true: "Listed or conservation area", false: "Not said" } },
    priority: { type: "choice" as const, instructions: "Does the homeowner say what matters most to them?", criteria: { none: "Not said", carbon: "Cutting carbon / the environment", cost: "Saving money / bills / payback" } },
  };
  const a = await decide({ message: text }, questions);
  let s: MemorySuggestion;
  if (a) {
    const t = decisionThreshold();
    const sure = (q: string, option: string) => (a[q]?.probabilities?.[option] ?? 0) >= t;
    s = {
      completed: RETROFIT_IDS.filter((id) => sure(id, "done")),
      declined: Object.fromEntries(RETROFIT_IDS.filter((id) => sure(id, "not_wanted")).map((id) => [id, rules?.declined[id] ?? "You said not for you"])),
      ...((a.renting?.probability ?? 0) >= t && { renting: true as const }),
      ...((a.listed?.probability ?? 0) >= t && { listed: true as const }),
      ...(rules?.budget_gbp != null && { budget_gbp: Math.round(rules.budget_gbp) }),
      ...(sure("priority", "carbon") ? { priority: "carbon" as const } : sure("priority", "cost") ? { priority: "cost" as const } : {}),
      source: "decision model",
    };
  } else if (rules) {
    s = {
      completed: rules.completed,
      declined: rules.declined,
      ...(rules.renting && { renting: true as const }),
      ...(rules.listed && { listed: true as const }),
      ...(rules.budget_gbp != null && { budget_gbp: Math.round(rules.budget_gbp) }),
      ...(rules.priority && { priority: rules.priority }),
      source: "rules",
    };
  } else return null;
  return empty(s) ? null : s;
}

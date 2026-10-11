import { z } from "zod";
import type { RetrofitId } from "@/lib/twin/types";

export const RETROFIT_IDS = [
  "loft_insulation",
  "cavity_wall_insulation",
  "solid_wall_insulation",
  "floor_insulation",
  "double_glazing",
  "smart_thermostat",
  "heat_pump",
  "solar_pv",
  "condensing_boiler",
] as const satisfies readonly RetrofitId[];

export const retrofitId = z.enum(RETROFIT_IDS);

/** Display names, as the engine labels them (config.LABEL), for measures that are no longer in the plan. */
export const RETROFIT_LABEL: Record<RetrofitId, string> = {
  loft_insulation: "Loft insulation",
  cavity_wall_insulation: "Cavity wall insulation",
  solid_wall_insulation: "Solid wall insulation",
  floor_insulation: "Floor insulation",
  double_glazing: "Double glazing",
  smart_thermostat: "Smart thermostat / zoned controls",
  heat_pump: "Heat pump",
  solar_pv: "Solar PV",
  condensing_boiler: "Condensing boiler",
};

export const memorySchema = z.object({
  completed: z.array(retrofitId).default([]),
  declined: z.partialRecord(retrofitId, z.string().max(200)).default({}),
  renting: z.boolean().default(false),
  listed: z.boolean().default(false),
  budget_gbp: z.number().int().min(0).max(100_000).nullable().default(null),
  priority: z.enum(["carbon", "cost"]).nullable().default(null),
  log: z.array(z.object({ at: z.string(), text: z.string().max(300) })).max(100).default([]),
});

export type Memory = z.infer<typeof memorySchema>;

/** What is sent to the engine: everything but the log. */
export type MemoryForEngine = Omit<Memory, "log">;

export const parseMemory = (raw: unknown): Memory => memorySchema.catch(() => memorySchema.parse({})).parse(raw ?? {});

export const toEngineMemory = (m: Memory): MemoryForEngine => ({ completed: m.completed, declined: m.declined, renting: m.renting, listed: m.listed, budget_gbp: m.budget_gbp, priority: m.priority });

export const hasMemory = (m: Memory) => m.log.length > 0 || m.completed.length > 0 || Object.keys(m.declined).length > 0 || m.renting || m.listed || m.budget_gbp != null || m.priority != null;

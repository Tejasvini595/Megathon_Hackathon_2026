import { z } from "zod";

/** What model/api.py returns for /twin: the engine part of TwinState (types.ts) plus the facts the LLM may use. */
const band = z.object({ p10: z.number(), p50: z.number(), p90: z.number() });
const epc = z.enum(["A", "B", "C", "D", "E", "F", "G"]);
const scoreClass = z.enum(["Highly efficient", "Good", "Moderate", "Poor", "Very poor"]);
const retrofitId = z.enum(["loft_insulation", "cavity_wall_insulation", "solid_wall_insulation", "floor_insulation", "double_glazing", "smart_thermostat", "heat_pump", "solar_pv", "condensing_boiler"]);
const elementScores = z.object({ roof: z.number().nullable(), walls: z.number().nullable(), floor: z.number().nullable(), windows: z.number().nullable() });
const pair = z.tuple([z.number(), z.number()]);

const packageResult = z.object({
  retrofits: z.array(retrofitId),
  gasSavingKwh: band,
  elecSavingKwh: band,
  carbonSavingKg: band,
  improvementPotentialPct: z.number().nullable(),
  costGbp: pair,
  billSavingGbp: z.number(),
  scoreAfter: z.number(),
  classAfter: scoreClass,
  sapAfter: z.number(),
  bandAfter: epc,
  elementScoresAfter: elementScores,
});

const monthly = z.tuple([z.number(), z.number()]);
const loanId = z.enum(["personal", "mortgage"]);
const finance = z.object({
  thresholdSap: z.number(),
  alreadyC: z.boolean(),
  plans: z.array(
    z.object({
      id: z.enum(["full", "noHeatPump", "toC"]),
      label: z.string(),
      retrofits: z.array(retrofitId),
      costGbp: pair,
      costWithGrantGbp: pair.nullable(),
      billSavingMonthGbp: z.tuple([z.number(), z.number(), z.number()]),
      sapAfter: z.number(),
      bandAfter: epc,
      reachesC: z.enum(["yes", "borderline", "no"]),
      options: z.array(
        z.object({
          loan: loanId,
          termYears: z.number(),
          repaymentGbp: monthly,
          netGbp: monthly,
          repaymentWithGrantGbp: monthly.nullable(),
          netWithGrantGbp: monthly.nullable(),
          interestGbp: pair,
        }),
      ),
    }),
  ),
  assumptions: z.object({
    loans: z.array(z.object({ id: loanId, label: z.string(), aprPct: z.number(), terms: z.array(z.number()) })),
    tariffGbpPerKwh: z.object({ elec: z.number(), gas: z.number() }),
    heatPumpGrantGbp: z.number().nullable(),
    sources: z.array(z.string()),
  }),
  note: z.string(),
});

export const engineTwinSchema = z.object({
  rating: z.object({
    sap: z.number(),
    band: epc,
    source: z.enum(["recorded", "band", "estimated"]),
    range: z.object({ sap: pair, band: z.tuple([epc, epc]) }).nullable(),
  }),
  score: z.number(),
  scoreClass,
  scoreRange: z.object({ low: z.number(), high: z.number() }).nullable(),
  components: z.array(
    z.object({
      key: z.enum(["energy_efficiency", "consumption_intensity", "insulation", "heating", "glazing", "renewables", "smart"]),
      label: z.string(),
      weight: z.number(),
      subScore: z.number().nullable(),
      contribution: z.number().nullable(),
      maxContribution: z.number().nullable(),
      estimated: z.boolean().optional(),
      reason: z.string(),
    }),
  ),
  keyIssues: z.array(z.string()),
  isPoor: z.boolean(),
  elementScores,
  energy: z.object({
    gasKwh: z.number(),
    elecKwh: z.number(),
    otherKwh: z.number(),
    intensityKwhM2: z.number().nullable(),
    source: z.enum(["metered", "modelled"]),
    monthsMetered: z.number(),
    monthly: z.array(z.object({ month: z.string(), elecKwh: z.number().nullable(), gasKwh: z.number().nullable() })),
  }),
  carbonKg: z.number(),
  retrofits: z.array(
    z.object({
      id: retrofitId,
      label: z.string(),
      order: z.number(),
      suitability: z.enum(["High", "Medium", "Low"]),
      relevance: z.object({ tier: z.enum(["High", "Medium", "Low", "needs survey"]), confidence: z.number() }).nullable(),
      element: z.enum(["roof", "walls", "windows", "floor", "draughts", "system", "roof_pv"]),
      reason: z.string(),
      gasSavingKwh: band,
      elecSavingKwh: band,
      carbonSavingKg: band,
      costGbp: pair,
      billSavingGbp: z.number(),
      paybackYears: z.number().nullable(),
      scoreAfter: z.number(),
    }),
  ),
  excluded: z.array(z.object({ id: retrofitId, reason: z.string() })),
  needsInfo: z.array(z.object({ id: retrofitId, question: z.string(), field: z.string().nullable() })),
  package: packageResult.nullable(),
  packageNoHeatPump: packageResult.nullable(),
  value: z.object({ currentGbp: z.number().nullable(), upliftPct: pair.nullable(), valueAfterGbp: pair.nullable(), note: z.string() }),
  finance: finance.nullable().default(null),
  flags: z.array(z.object({ field: z.string(), message: z.string(), severity: z.enum(["info", "warn"]) })),
  unavailableReason: z.string().nullable(),
  modelVersion: z.string(),
});

export const engineResponseSchema = z.object({
  twin: engineTwinSchema,
  llm: z.object({ facts: z.record(z.string(), z.unknown()), slots: z.record(z.string(), z.unknown()), template: z.string() }),
});

export type EngineResponse = z.infer<typeof engineResponseSchema>;

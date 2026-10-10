/**
 * Frontend <-> engine contract. The engine (Python) returns a TwinState per home and per scenario.
 * Every number here is computed by the engine; the UI and the LLM only display or explain it.
 */

export type BuiltForm = "detached" | "semi" | "end_terrace" | "mid_terrace" | "flat";
export type RoofShape = "gable" | "hip" | "flat";
export type Element = "roof" | "walls" | "windows" | "floor" | "draughts";
export type Suitability = "High" | "Medium" | "Low";
export type ScoreClass = "Highly efficient" | "Good" | "Moderate" | "Poor" | "Very poor";
export type RetrofitId =
  | "loft_insulation"
  | "cavity_wall_insulation"
  | "solid_wall_insulation"
  | "floor_insulation"
  | "double_glazing"
  | "smart_thermostat"
  | "heat_pump"
  | "solar_pv"
  | "condensing_boiler";

/** Drives the procedural 3D house. */
export type Geometry = {
  builtForm: BuiltForm;
  storeys: number;
  roof: RoofShape;
  windowsPerFloor: number;
  /** Rough footprint in metres; the house is scaled to it. */
  width: number;
  depth: number;
  hasSolar: boolean;
  hasHeatPump: boolean;
  chimney: boolean;
};

/** A P10–P50–P90 band. Savings are estimates, never guarantees. */
export type Band = { p10: number; p50: number; p90: number };

export type ScoreComponent = {
  key:
    | "energy_efficiency"
    | "consumption_intensity"
    | "insulation"
    | "heating"
    | "glazing"
    | "renewables"
    | "smart";
  label: string;
  weight: number; // fraction, sums to 1
  subScore: number; // 0-100
  contribution: number; // weight * subScore
  reason: string;
};

export type Retrofit = {
  id: RetrofitId;
  label: string;
  order: number;
  suitability: Suitability;
  /** Probability from the decision model behind the suitability tier. */
  confidence: number;
  element: Element | "system" | "roof_pv";
  reason: string;
  /** kWh/year; negative means consumption rises. */
  gasSavingKwh: Band;
  elecSavingKwh: Band;
  carbonSavingKg: Band;
  costGbp: [number, number];
  scoreAfter: number;
};

export type DataFlag = { field: string; message: string; severity: "info" | "warn" };

export type TwinState = {
  homeId: string;
  scenarioId: string | null;
  nickname: string;
  postcode: string | null;
  geometry: Geometry;
  /** Share of total fabric heat loss by element, 0-1, sums to 1. Drives thermal vision. */
  heatLoss: Record<Element, number>;
  heatLossWPerK: number;
  epcBand: "A" | "B" | "C" | "D" | "E" | "F" | "G" | null;
  score: number;
  scoreClass: ScoreClass;
  components: ScoreComponent[];
  keyIssues: string[];
  energy: {
    gasKwh: number | null;
    elecKwh: number | null;
    intensityKwhM2: number | null;
    monthsMetered: number;
    /** Positive = uses more than the fabric model predicts. */
    performanceGapPct: number | null;
  };
  carbonKg: number | null;
  retrofits: Retrofit[];
  package: {
    gasSavingKwh: Band;
    elecSavingKwh: Band;
    carbonSavingKg: Band;
    improvementPotentialPct: number | null;
    scoreAfter: number;
    classAfter: ScoreClass;
    /** Heat-loss shares after the package, relative to today's total (so they sum to < 1). */
    heatLossAfter: Record<Element, number>;
  };
  value: {
    currentGbp: number | null;
    upliftPct: [number, number] | null;
    note: string;
  };
  confidence: number; // 0-1 overall data confidence
  flags: DataFlag[];
};

export const SCORE_CLASSES: { min: number; label: ScoreClass }[] = [
  { min: 80, label: "Highly efficient" },
  { min: 65, label: "Good" },
  { min: 50, label: "Moderate" },
  { min: 30, label: "Poor" },
  { min: 0, label: "Very poor" },
];

export function classify(score: number): ScoreClass {
  return SCORE_CLASSES.find((c) => Math.round(score) >= c.min)!.label;
}

/**
 * Frontend <-> engine contract. The engine (Python, model/api.py) returns a TwinState per home and per scenario;
 * src/lib/engine.ts only renames and reshapes it. Every number here is computed by the engine; the UI and the LLM
 * only display or explain it.
 */

export type BuiltForm = "detached" | "semi" | "end_terrace" | "mid_terrace" | "flat";
export type RoofShape = "gable" | "hip" | "flat";
export type Element = "roof" | "walls" | "windows" | "floor" | "draughts";
export type Suitability = "High" | "Medium" | "Low";
/** The engine's learned relevance of a measure; "needs survey" when it is not confident enough to say. */
export type Relevance = Suitability | "needs survey";
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
  /** Installed (or proposed) solar size; drives how many panels are drawn. */
  solarKw?: number;
  hasHeatPump: boolean;
  chimney: boolean;
  isTopFloor?: boolean;
  /** Flats: floors in the whole building, and the floor (0 = ground) the home starts on. */
  blockStoreys?: number;
  floorIndex?: number;
  /** Compass bearing of the model's +x axis, when the real outline is known (for the sun view). */
  xBearingDeg?: number;
};

/** A P10–P50–P90 band. Savings are estimates, never guarantees. */
export type Band = { p10: number; p50: number; p90: number };

export type ComponentKey = "energy_efficiency" | "consumption_intensity" | "insulation" | "heating" | "glazing" | "renewables" | "smart";

export type ScoreComponent = {
  key: ComponentKey;
  label: string;
  weight: number; // fraction, sums to 1
  /** 0-100; null when the input is not known (the component is left out and the score is provisional). */
  subScore: number | null;
  contribution: number | null; // points
  maxContribution: number | null;
  /** True when the sub-score comes from the SAP estimator, not a recorded rating. */
  estimated?: boolean;
  reason: string;
};

export type Retrofit = {
  id: RetrofitId;
  label: string;
  order: number;
  /** Payback-based tier from the engine's rules. */
  suitability: Suitability;
  /** The learned relevance model's view, with its calibrated confidence. */
  relevance: { tier: Relevance; confidence: number } | null;
  element: Element | "system" | "roof_pv";
  reason: string;
  /** kWh/year; negative means consumption rises. Marginal within the package, so they add up to it. */
  gasSavingKwh: Band;
  elecSavingKwh: Band;
  carbonSavingKg: Band;
  costGbp: [number, number];
  billSavingGbp: number;
  paybackYears: number | null;
  /** The score if this measure alone were done. */
  scoreAfter: number;
};

export type PackageResult = {
  retrofits: RetrofitId[];
  gasSavingKwh: Band;
  elecSavingKwh: Band;
  carbonSavingKg: Band;
  improvementPotentialPct: number | null;
  costGbp: [number, number];
  billSavingGbp: number;
  scoreAfter: number;
  classAfter: ScoreClass;
  sapAfter: number;
  bandAfter: EpcBand;
  /** Per-part insulation scores after the package (see TwinState.elementScores). */
  elementScoresAfter: ElementScores;
};

export type EpcBand = "A" | "B" | "C" | "D" | "E" | "F" | "G";
/** 0-100 insulation state of each part (higher is better); null when the part doesn't apply (e.g. a flat with a home above). */
export type ElementScores = Record<"roof" | "walls" | "floor" | "windows", number | null>;
export type DataFlag = { field: string; message: string; severity: "info" | "warn" };

export type TwinState = {
  homeId: string;
  scenarioId: string | null;
  nickname: string;
  postcode: string | null;
  geometry: Geometry;
  /** Where the SAP behind "energy efficiency" came from. Estimated ratings carry their P10-P90 range. */
  rating: {
    sap: number;
    band: EpcBand;
    source: "recorded" | "band" | "estimated";
    range: { sap: [number, number]; band: [EpcBand, EpcBand] } | null;
  };
  score: number;
  scoreClass: ScoreClass;
  /** The score at the ends of the estimated rating's range, or with missing inputs at worst / best; null when exact. */
  scoreRange: { low: number; high: number } | null;
  components: ScoreComponent[];
  keyIssues: string[];
  isPoor: boolean;
  elementScores: ElementScores;
  energy: {
    gasKwh: number;
    elecKwh: number;
    otherKwh: number;
    intensityKwhM2: number | null;
    source: "metered" | "modelled";
    monthsMetered: number;
    /** The readings the user gave, for the chart. */
    monthly: { month: string; elecKwh: number | null; gasKwh: number | null }[];
  };
  carbonKg: number;
  retrofits: Retrofit[];
  excluded: { id: RetrofitId; reason: string }[];
  /** "Confirm X before this saving can be estimated"; `field` is the record field to ask about. */
  needsInfo: { id: RetrofitId; question: string; field: string | null }[];
  package: PackageResult | null;
  /** The fabric-led alternative without a heat pump, when the package includes one. */
  packageNoHeatPump: PackageResult | null;
  value: {
    currentGbp: number | null;
    /** Indicative uplift range for the package; the value after it (in pounds) needs the home's current value. */
    upliftPct: [number, number] | null;
    valueAfterGbp: [number, number] | null;
    note: string;
  };
  /** Conflicts, estimated inputs, outside the training area, etc. */
  flags: DataFlag[];
  /** Savings, carbon and value are unavailable for heating outside grid electricity + gas; the reason. */
  unavailableReason: string | null;
  modelVersion: string;
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

/** Thermal-view glow per part, 0 (well insulated) to 1 (poorly insulated), straight from the engine's insulation scores. */
export function thermalGlow(e: ElementScores): Record<Element, number> {
  const g = (v: number | null) => (v == null ? 0 : (100 - v) / 100);
  return { roof: g(e.roof), walls: g(e.walls), floor: g(e.floor), windows: g(e.windows), draughts: 0 };
}

import type { PropertyRecord } from "@/lib/extract/fields";
import type { RetrofitId } from "@/lib/twin/types";

const YEAR = [
  [300, 1800], [290, 1500], [270, 1100], [250, 700], [230, 400], [220, 300],
  [220, 280], [230, 300], [250, 450], [270, 850], [290, 1300], [310, 1700],
] as const;
const months = (shape: readonly (readonly [number, number])[], gas = 1) =>
  shape.map(([elecKwh, gasKwh], i) => ({ month: `${i < 3 ? 2025 : 2026}-${String(((i + 9) % 12) + 1).padStart(2, "0")}`, elecKwh, gasKwh: Math.round(gasKwh * gas) }));

const base = {
  propertyType: "house", builtForm: "semi", storeys: 2, flatLevel: null, blockStoreys: null, ageBand: "1930_1949", floorAreaM2: 90, rooms: 4,
  wallType: "cavity", wallInsulation: "none", roofType: "gable", loftInsulation: "thin", flatRoofInsulation: null, floorType: "suspended", floorInsulation: "none",
  glazing: "single", heating: "gas_boiler", boilerAge: "before_2005", controls: "programmer", solarPv: "no", solarKw: null,
  epcBand: "E", sapScore: 45, thermostatC: null, currentValueGbp: 280000, postcode: "M14 6HT",
  usage: { months: months(YEAR) },
} as unknown as PropertyRecord;

export type CaseId = "missing" | "conflict" | "infeasible" | "interacting" | "electricity" | "insufficient";

export type EdgeCase = {
  id: CaseId;
  title: string;
  brief: string;
  /** What the engine is asked, and what to look for in its answer. */
  note: string;
  nickname: string;
  record: PropertyRecord;
  /** A scenario sent as `retrofits`; null runs the engine's recommended plan. */
  scenario: RetrofitId[] | null;
  /** A second run asking for one measure on its own, to compare with its marginal figure in the plan. */
  alone?: RetrofitId;
  /** Show the per-measure savings table (the cases about the plan, not the rating). */
  plan?: true;
  /** Record fields shown as the key inputs. */
  inputs: (keyof PropertyRecord)[];
};

export const CASES: EdgeCase[] = [
  {
    id: "missing",
    title: "Missing information",
    brief: "Property data is missing: no EPC rating and no usable meter readings.",
    note: "The rating is estimated with a range, energy is modelled, and the score is marked provisional.",
    nickname: "Edge case: missing data",
    record: { ...base, epcBand: "unknown", sapScore: null, currentValueGbp: null, usage: { months: months(YEAR).slice(0, 3) } },
    scenario: null,
    inputs: ["epcBand", "heating", "floorAreaM2", "wallType", "glazing"],
  },
  {
    id: "conflict",
    title: "Conflicting data",
    brief: "Sources disagree: the certificate says one thing, the home says another.",
    note: "An EPC of A on a home with uninsulated walls, single glazing and an old boiler is flagged, not silently trusted.",
    nickname: "Edge case: conflicting data",
    record: { ...base, wallType: "solid_brick", ageBand: "pre1900", loftInsulation: "none", epcBand: "A", sapScore: 94 },
    scenario: null,
    inputs: ["epcBand", "sapScore", "wallType", "wallInsulation", "glazing", "boilerAge"],
  },
  {
    id: "infeasible",
    title: "Infeasible retrofits",
    brief: "Some measures cannot be done on this home, and the user may still ask for them.",
    note: "Asked for cavity wall insulation, loft insulation, solar and a smart thermostat on a top-floor flat that has a flat roof, solid walls, solar and smart controls: every one is excluded with its reason instead of being priced.",
    nickname: "Edge case: infeasible retrofits",
    record: {
      ...base, propertyType: "flat", builtForm: "flat", storeys: 1, flatLevel: "top", blockStoreys: 5, wallType: "solid_brick", ageBand: "1900_1929", floorAreaM2: 62, rooms: 3,
      roofType: "flat", loftInsulation: null, flatRoofInsulation: "full", floorType: null, floorInsulation: null, solarPv: "yes", solarKw: 2.5, glazing: "double", boilerAge: "from_2005", controls: "smart", epcBand: "D", sapScore: 62,
    },
    scenario: ["cavity_wall_insulation", "loft_insulation", "solar_pv", "smart_thermostat"],
    inputs: ["propertyType", "flatLevel", "wallType", "roofType", "solarPv", "controls"],
  },
  {
    id: "interacting",
    title: "Interacting retrofits",
    brief: "Measures interact: insulation first changes what a heat pump saves.",
    note: "Per-measure savings are marginal within the ordered package, so they add up to it instead of double counting.",
    nickname: "Edge case: interacting retrofits",
    record: base,
    scenario: null,
    alone: "heat_pump",
    plan: true,
    inputs: ["wallType", "wallInsulation", "loftInsulation", "glazing", "heating", "boilerAge"],
  },
  {
    id: "electricity",
    title: "Electricity goes up",
    brief: "Electricity use rises after a heating-system change.",
    note: "Swapping gas for a heat pump cuts gas and carbon, but electricity use rises and the bill may not fall.",
    nickname: "Edge case: electricity rises",
    record: { ...base, wallInsulation: "full", loftInsulation: "thick", glazing: "double", boilerAge: "from_2005", controls: "smart", epcBand: "D", sapScore: 62 },
    scenario: ["heat_pump"],
    plan: true,
    inputs: ["heating", "boilerAge", "wallInsulation", "loftInsulation", "glazing", "controls"],
  },
  {
    id: "insufficient",
    title: "Not enough to estimate",
    brief: "There is not enough information to estimate savings or property-value impact.",
    note: "Oil heating is outside the gas and electricity data the savings are built on, so figures are withheld with a reason. Without a home value, value is a percentage only.",
    nickname: "Edge case: not enough information",
    record: {
      ...base, heating: "oil_boiler", boilerAge: null, currentValueGbp: null,
      usage: { annual: { elecKwh: 3200, gasKwh: 0 }, oilLitres: 2200 },
    },
    scenario: null,
    inputs: ["heating", "currentValueGbp", "epcBand", "floorAreaM2"],
  },
];

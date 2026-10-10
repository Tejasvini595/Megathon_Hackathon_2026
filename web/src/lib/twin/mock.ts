import type { TwinState } from "./types";

/**
 * Placeholder engine output shaped like the brief's P10001 (rating E, single glazing, poor insulation,
 * gas boiler, no solar, score 38 Poor). Used until the Python engine is wired in.
 * Numbers are illustrative, not engine output.
 */
export const MOCK_TWIN: TwinState = {
  homeId: "mock",
  scenarioId: null,
  nickname: "12 Acacia Road",
  postcode: "M14 6HT",
  geometry: {
    builtForm: "semi",
    storeys: 2,
    roof: "gable",
    windowsPerFloor: 3,
    width: 7,
    depth: 8,
    hasSolar: false,
    hasHeatPump: false,
    chimney: true,
  },
  heatLoss: { roof: 0.27, walls: 0.33, windows: 0.2, floor: 0.08, draughts: 0.12 },
  heatLossWPerK: 312,
  epcBand: "E",
  score: 38,
  scoreClass: "Poor",
  components: [
    { key: "energy_efficiency", label: "Energy efficiency", weight: 0.25, subScore: 44, contribution: 11, reason: "EPC rating E (SAP 47)" },
    { key: "consumption_intensity", label: "Energy intensity", weight: 0.2, subScore: 35, contribution: 7, reason: "214 kWh/m² a year metered, worse than 71% of similar homes" },
    { key: "insulation", label: "Insulation", weight: 0.15, subScore: 30, contribution: 4.5, reason: "Unfilled cavity walls, 50 mm loft insulation" },
    { key: "heating", label: "Heating system", weight: 0.15, subScore: 60, contribution: 9, reason: "Gas combi boiler, non-condensing" },
    { key: "glazing", label: "Windows & glazing", weight: 0.1, subScore: 25, contribution: 2.5, reason: "Mostly single glazed" },
    { key: "renewables", label: "Renewables", weight: 0.1, subScore: 0, contribution: 0, reason: "No solar or other generation" },
    { key: "smart", label: "Smart controls", weight: 0.05, subScore: 80, contribution: 4, reason: "Programmer, room thermostat and TRVs" },
  ],
  keyIssues: [
    "Walls lose a third of the heat: cavity is unfilled",
    "Single glazing on most windows",
    "Loft insulation is thin (50 mm)",
    "Uses 23% more gas than its construction suggests",
  ],
  energy: { gasKwh: 14200, elecKwh: 4100, intensityKwhM2: 214, monthsMetered: 10, performanceGapPct: 23 },
  carbonKg: 3400,
  retrofits: [
    {
      id: "loft_insulation", label: "Loft insulation to 270 mm", order: 1, suitability: "High", confidence: 0.94, element: "roof",
      reason: "Loft has only 50 mm; the roof is 27% of heat loss.",
      gasSavingKwh: { p10: 1100, p50: 1450, p90: 1800 }, elecSavingKwh: { p10: 0, p50: 0, p90: 0 },
      carbonSavingKg: { p10: 200, p50: 265, p90: 330 }, costGbp: [400, 900], scoreAfter: 43,
    },
    {
      id: "cavity_wall_insulation", label: "Cavity wall insulation", order: 2, suitability: "High", confidence: 0.88, element: "walls",
      reason: "Cavity walls built 1950-66 with no fill recorded; walls are the largest loss.",
      gasSavingKwh: { p10: 1400, p50: 1900, p90: 2400 }, elecSavingKwh: { p10: 0, p50: 0, p90: 0 },
      carbonSavingKg: { p10: 255, p50: 350, p90: 440 }, costGbp: [1200, 2500], scoreAfter: 49,
    },
    {
      id: "double_glazing", label: "Double glazing", order: 3, suitability: "Medium", confidence: 0.71, element: "windows",
      reason: "Single glazing on most windows; check conservation-area rules.",
      gasSavingKwh: { p10: 500, p50: 700, p90: 950 }, elecSavingKwh: { p10: 0, p50: 0, p90: 0 },
      carbonSavingKg: { p10: 90, p50: 130, p90: 175 }, costGbp: [4500, 8000], scoreAfter: 54,
    },
    {
      id: "smart_thermostat", label: "Smart thermostat", order: 4, suitability: "High", confidence: 0.9, element: "system",
      reason: "Gas use is 23% above the fabric model, which points to long heating hours.",
      gasSavingKwh: { p10: 350, p50: 600, p90: 850 }, elecSavingKwh: { p10: -20, p50: -15, p90: -10 },
      carbonSavingKg: { p10: 60, p50: 107, p90: 154 }, costGbp: [150, 300], scoreAfter: 56,
    },
    {
      id: "heat_pump", label: "Air source heat pump", order: 5, suitability: "Medium", confidence: 0.64, element: "system",
      reason: "Feasible after fabric upgrades. Gas goes to zero but electricity rises.",
      gasSavingKwh: { p10: 9200, p50: 9550, p90: 9800 }, elecSavingKwh: { p10: -3900, p50: -3400, p90: -2900 },
      carbonSavingKg: { p10: 900, p50: 1080, p90: 1230 }, costGbp: [7500, 13000], scoreAfter: 68,
    },
    {
      id: "solar_pv", label: "Solar panels, 3 kWp", order: 6, suitability: "High", confidence: 0.83, element: "roof_pv",
      reason: "South-west roof with no shading recorded. Cuts grid imports, not demand.",
      gasSavingKwh: { p10: 0, p50: 0, p90: 0 }, elecSavingKwh: { p10: 850, p50: 1100, p90: 1300 },
      carbonSavingKg: { p10: 165, p50: 215, p90: 255 }, costGbp: [5000, 7500], scoreAfter: 74,
    },
  ],
  package: {
    gasSavingKwh: { p10: 13600, p50: 14200, p90: 14200 },
    elecSavingKwh: { p10: -3000, p50: -2300, p90: -1700 },
    carbonSavingKg: { p10: 2100, p50: 2150, p90: 2250 },
    improvementPotentialPct: 65,
    scoreAfter: 74,
    classAfter: "Good",
    heatLossAfter: { roof: 0.07, walls: 0.14, windows: 0.11, floor: 0.08, draughts: 0.09 },
  },
  value: {
    currentGbp: 285000,
    upliftPct: [2, 5],
    note: "Indicative: based on how EPC ratings relate to sale prices in this area, not a proven effect.",
  },
  confidence: 0.78,
  flags: [
    { field: "energy", message: "10 of 12 months metered; 2 months estimated", severity: "info" },
    { field: "wall_insulation", message: "Wall insulation is assumed in the EPC, not observed", severity: "warn" },
  ],
};

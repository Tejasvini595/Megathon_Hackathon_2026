import type { Band, PackageResult, TwinState } from "./types";

/**
 * Placeholder engine output shaped like the brief's P10001 (rating E, single glazing, poor insulation,
 * gas boiler, no solar, score 38 Poor). Used only when the engine is unreachable, and labelled as such.
 * Numbers are illustrative, not engine output.
 */
const b = (p10: number, p50: number, p90: number): Band => ({ p10, p50, p90 });
const zero = b(0, 0, 0);

const fullPackage: PackageResult = {
  retrofits: ["loft_insulation", "cavity_wall_insulation", "double_glazing", "smart_thermostat", "heat_pump", "solar_pv"],
  gasSavingKwh: b(13600, 14200, 14200),
  elecSavingKwh: b(-3000, -2300, -1700),
  carbonSavingKg: b(2100, 2150, 2250),
  improvementPotentialPct: 65,
  costGbp: [18750, 32200],
  billSavingGbp: 410,
  scoreAfter: 74,
  classAfter: "Good",
  sapAfter: 71,
  bandAfter: "C",
  elementScoresAfter: { roof: 100, walls: 90, floor: 15, windows: 75 },
};

export const MOCK_TWIN: TwinState = {
  homeId: "mock",
  scenarioId: null,
  nickname: "12 Acacia Road",
  postcode: "M14 6HT",
  geometry: { builtForm: "semi", storeys: 2, roof: "gable", windowsPerFloor: 3, width: 7, depth: 8, hasSolar: false, hasHeatPump: false, chimney: true },
  rating: { sap: 47, band: "E", source: "recorded", range: null },
  score: 38,
  scoreClass: "Poor",
  scoreRange: null,
  components: [
    { key: "energy_efficiency", label: "Energy efficiency", weight: 0.25, subScore: 47, contribution: 11.75, maxContribution: 25, reason: "EPC rating E (SAP 47)" },
    { key: "consumption_intensity", label: "Energy use per m²", weight: 0.2, subScore: 33, contribution: 6.6, maxContribution: 20, reason: "214 kWh/m² a year, metered" },
    { key: "insulation", label: "Insulation", weight: 0.15, subScore: 21, contribution: 3.15, maxContribution: 15, reason: "Uninsulated cavity walls, thin loft insulation" },
    { key: "heating", label: "Heating system", weight: 0.15, subScore: 40, contribution: 6, maxContribution: 15, reason: "Gas boiler, non-condensing" },
    { key: "glazing", label: "Windows & glazing", weight: 0.1, subScore: 5, contribution: 0.5, maxContribution: 10, reason: "Single glazing" },
    { key: "renewables", label: "Renewables", weight: 0.1, subScore: 0, contribution: 0, maxContribution: 10, reason: "No solar or other generation" },
    { key: "smart", label: "Smart controls", weight: 0.05, subScore: 50, contribution: 2.5, maxContribution: 5, reason: "Programmer, room thermostat and TRVs" },
  ],
  keyIssues: ["Poor insulation (uninsulated walls, thin/no loft insulation)", "Single/partial glazing", "No renewable generation"],
  isPoor: true,
  elementScores: { roof: 25, walls: 10, floor: 15, windows: 5 },
  energy: {
    gasKwh: 14200,
    elecKwh: 4100,
    otherKwh: 0,
    intensityKwhM2: 214,
    source: "metered",
    monthsMetered: 12,
    monthly: [
      ["2025-10", 330, 1050], ["2025-11", 360, 1700], ["2025-12", 400, 2150], ["2026-01", 410, 2300], ["2026-02", 380, 1950], ["2026-03", 350, 1500],
      ["2026-04", 320, 950], ["2026-05", 300, 600], ["2026-06", 280, 420], ["2026-07", 290, 400], ["2026-08", 300, 430], ["2026-09", 380, 750],
    ].map(([month, elecKwh, gasKwh]) => ({ month: month as string, elecKwh: elecKwh as number, gasKwh: gasKwh as number })),
  },
  carbonKg: 3400,
  retrofits: [
    {
      id: "loft_insulation", label: "Loft insulation", order: 1, suitability: "High", relevance: { tier: "High", confidence: 0.94 }, element: "roof",
      reason: "Loft/roof insulation below ~200 mm", gasSavingKwh: b(1100, 1450, 1800), elecSavingKwh: zero, carbonSavingKg: b(200, 265, 330),
      costGbp: [400, 900], billSavingGbp: 100, paybackYears: 6.5, scoreAfter: 41,
    },
    {
      id: "cavity_wall_insulation", label: "Cavity wall insulation", order: 2, suitability: "High", relevance: { tier: "High", confidence: 0.88 }, element: "walls",
      reason: "Cavity wall without full insulation", gasSavingKwh: b(1400, 1900, 2400), elecSavingKwh: zero, carbonSavingKg: b(255, 350, 440),
      costGbp: [1200, 2500], billSavingGbp: 133, paybackYears: 13.9, scoreAfter: 46,
    },
    {
      id: "double_glazing", label: "Double glazing", order: 3, suitability: "Low", relevance: { tier: "Medium", confidence: 0.71 }, element: "windows",
      reason: "Single/partial double glazing", gasSavingKwh: b(500, 700, 950), elecSavingKwh: zero, carbonSavingKg: b(90, 130, 175),
      costGbp: [4500, 8000], billSavingGbp: 49, paybackYears: null, scoreAfter: 46,
    },
    {
      id: "smart_thermostat", label: "Smart thermostat / zoned controls", order: 4, suitability: "High", relevance: { tier: "needs survey", confidence: 0.62 }, element: "system",
      reason: "Controls below zoned/smart level", gasSavingKwh: b(350, 600, 850), elecSavingKwh: zero, carbonSavingKg: b(60, 107, 154),
      costGbp: [150, 300], billSavingGbp: 42, paybackYears: 5.4, scoreAfter: 41,
    },
    {
      id: "heat_pump", label: "Heat pump", order: 5, suitability: "Low", relevance: { tier: "High", confidence: 0.91 }, element: "system",
      reason: "Replaces gas/electric heating; electricity use rises 3400 kWh/yr while gas falls 9550 kWh/yr", gasSavingKwh: b(9200, 9550, 9800),
      elecSavingKwh: b(-3900, -3400, -2900), carbonSavingKg: b(900, 1080, 1230), costGbp: [7500, 13000], billSavingGbp: -250, paybackYears: null, scoreAfter: 52,
    },
    {
      id: "solar_pv", label: "Solar PV (2.5 kWp)", order: 6, suitability: "Medium", relevance: { tier: "Medium", confidence: 0.83 }, element: "roof_pv",
      reason: "Roof available, no existing PV", gasSavingKwh: zero, elecSavingKwh: b(850, 1100, 1300), carbonSavingKg: b(165, 215, 255),
      costGbp: [5000, 7500], billSavingGbp: 297, paybackYears: 21, scoreAfter: 44,
    },
  ],
  excluded: [
    { id: "solid_wall_insulation", reason: "No uninsulated solid wall" },
    { id: "condensing_boiler", reason: "Replaced by the heat pump" },
  ],
  needsInfo: [{ id: "floor_insulation", question: "the floor construction or insulation is not known: confirm it before savings can be estimated", field: "floorInsulation" }],
  package: fullPackage,
  packageNoHeatPump: {
    ...fullPackage,
    retrofits: ["loft_insulation", "cavity_wall_insulation", "double_glazing", "smart_thermostat", "solar_pv"],
    gasSavingKwh: b(3600, 4650, 5600),
    elecSavingKwh: b(850, 1100, 1300),
    carbonSavingKg: b(860, 1070, 1300),
    improvementPotentialPct: 31,
    costGbp: [11250, 19200],
    billSavingGbp: 620,
    scoreAfter: 58,
    classAfter: "Moderate",
    sapAfter: 63,
    bandAfter: "D",
  },
  value: { currentGbp: 285000, upliftPct: [0.4, 5.1], valueAfterGbp: [286100, 299500], note: "Indicative range from historical sales in the dataset, not a proven effect." },
  flags: [{ field: "energy", message: "Example data: the engine is not connected", severity: "warn" }],
  unavailableReason: null,
  modelVersion: "mock",
};

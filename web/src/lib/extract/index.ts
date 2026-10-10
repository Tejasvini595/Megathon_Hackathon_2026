import type { Conflict, ExtractedField, ExtractionResult, FieldKey, FieldSource } from "./fields";

export type ExtractInput = {
  kind: "PHOTO" | "TEXT" | "PLAN" | "VOICE" | "POSTCODE";
  text?: string | null;
  fileUrl?: string | null;
  mimeType?: string | null;
};

/**
 * Swap point for the real pipeline: an agentic LLM reads photos/plans/text and calls typed decision
 * models (Jev for text, omni decision models for images) that answer in the FIELDS categories with
 * calibrated probabilities. Until then, `rulesExtractor` gives a deterministic, explainable baseline,
 * which is also the baseline we report against.
 */
export type Extractor = (inputs: ExtractInput[]) => Promise<ExtractionResult>;

const DEFAULTS: Record<FieldKey, string | number> = {
  propertyType: "house",
  builtForm: "semi",
  storeys: 2,
  ageBand: "1930_1949",
  floorAreaM2: 85,
  bedrooms: 3,
  wallType: "cavity",
  wallInsulation: "none",
  roofType: "gable",
  loftInsulationMm: 100,
  glazing: "double",
  heating: "gas_boiler",
  controls: "thermostat_trvs",
  solarPv: "no",
};

type Rule = { field: FieldKey; re: RegExp; value: string | number | ((m: RegExpMatchArray) => string | number); conf: number; why: string };

const RULES: Rule[] = [
  { field: "propertyType", re: /\bbungalow\b/i, value: "bungalow", conf: 0.95, why: "mentions a bungalow" },
  { field: "propertyType", re: /\bmaisonette\b/i, value: "maisonette", conf: 0.95, why: "mentions a maisonette" },
  { field: "propertyType", re: /\b(flat|apartment)\b/i, value: "flat", conf: 0.93, why: "mentions a flat" },
  { field: "builtForm", re: /\bsemi\b|semi-detached/i, value: "semi", conf: 0.94, why: "says semi-detached" },
  { field: "builtForm", re: /\bend[- ]terrace|end of terrace/i, value: "end_terrace", conf: 0.93, why: "says end terrace" },
  { field: "builtForm", re: /\b(mid[- ])?terrace(d)?\b/i, value: "mid_terrace", conf: 0.8, why: "says terrace" },
  { field: "builtForm", re: /\bdetached\b/i, value: "detached", conf: 0.9, why: "says detached" },
  { field: "builtForm", re: /\b(flat|apartment)\b/i, value: "flat", conf: 0.9, why: "a flat is part of a block" },
  { field: "bedrooms", re: /\b(\d)\s*-?\s*(bed|bedroom)/i, value: (m) => Number(m[1]), conf: 0.95, why: "states the bedroom count" },
  { field: "storeys", re: /\b(one|single)[- ]stor(e)?y\b/i, value: 1, conf: 0.9, why: "says single storey" },
  { field: "storeys", re: /\b(three|3)[- ]stor(e)?y/i, value: 3, conf: 0.9, why: "says three storeys" },
  { field: "floorAreaM2", re: /\b(\d{2,3})\s*(m2|m²|sq ?m|square met)/i, value: (m) => Number(m[1]), conf: 0.92, why: "states floor area" },
  { field: "ageBand", re: /\bvictorian|edwardian|18\d\d\b/i, value: "pre1900", conf: 0.82, why: "Victorian/Edwardian era" },
  { field: "ageBand", re: /\b19[0-2]\ds?\b/i, value: "1900_1929", conf: 0.8, why: "built 1900–1929" },
  { field: "ageBand", re: /\b19[34]\ds?\b|inter-?war/i, value: "1930_1949", conf: 0.82, why: "built 1930–1949" },
  { field: "ageBand", re: /\b19(5\d|6[0-6])s?\b/i, value: "1950_1966", conf: 0.82, why: "built 1950–1966" },
  { field: "ageBand", re: /\b19(6[7-9]|7\d|8[0-2])s?\b/i, value: "1967_1982", conf: 0.8, why: "built 1967–1982" },
  { field: "ageBand", re: /\b(new[- ]build|20(1[2-9]|2\d))\b/i, value: "2012_plus", conf: 0.85, why: "new build" },
  { field: "wallType", re: /\bsolid (brick|wall|stone)|stone wall/i, value: "solid", conf: 0.88, why: "mentions solid walls" },
  { field: "wallType", re: /\bcavity\b/i, value: "cavity", conf: 0.88, why: "mentions cavity walls" },
  { field: "wallType", re: /\btimber[- ]frame/i, value: "timber", conf: 0.88, why: "mentions timber frame" },
  { field: "wallInsulation", re: /(cavity|wall)s? (are |is )?(filled|insulated)|external wall insulation|internal wall insulation/i, value: "full", conf: 0.85, why: "says walls are insulated" },
  { field: "wallInsulation", re: /(no|without|un)[- ]?(wall )?insulat/i, value: "none", conf: 0.7, why: "says no insulation" },
  { field: "glazing", re: /single[- ]glaz/i, value: "single", conf: 0.92, why: "says single glazing" },
  { field: "glazing", re: /triple[- ]glaz/i, value: "triple", conf: 0.92, why: "says triple glazing" },
  { field: "glazing", re: /double[- ]glaz/i, value: "double", conf: 0.9, why: "says double glazing" },
  { field: "glazing", re: /some double|partly double|mix of (single|double)/i, value: "partial_double", conf: 0.85, why: "says mixed glazing" },
  { field: "heating", re: /heat pump|ashp|gshp/i, value: "heat_pump", conf: 0.93, why: "mentions a heat pump" },
  { field: "heating", re: /storage heater/i, value: "electric_storage", conf: 0.93, why: "mentions storage heaters" },
  { field: "heating", re: /electric (heater|heating|radiator)/i, value: "electric_room", conf: 0.88, why: "mentions electric heating" },
  { field: "heating", re: /\boil\b/i, value: "oil_boiler", conf: 0.85, why: "mentions oil" },
  { field: "heating", re: /communal|district heat|heat network/i, value: "heat_network", conf: 0.88, why: "mentions a heat network" },
  { field: "heating", re: /\b(gas|combi|boiler)\b/i, value: "gas_boiler", conf: 0.88, why: "mentions a gas boiler" },
  { field: "controls", re: /smart (thermostat|heating|controls)|hive|nest|tado/i, value: "smart", conf: 0.92, why: "mentions smart controls" },
  { field: "controls", re: /\btrvs?\b|thermostatic/i, value: "thermostat_trvs", conf: 0.85, why: "mentions TRVs" },
  { field: "solarPv", re: /solar|photovoltaic|\bpv\b/i, value: "yes", conf: 0.85, why: "mentions solar" },
  { field: "loftInsulationMm", re: /(\d{2,3})\s*mm/i, value: (m) => Number(m[1]), conf: 0.9, why: "states loft insulation depth" },
  { field: "loftInsulationMm", re: /no loft insulation|loft (is )?(not|un)insulated/i, value: 0, conf: 0.85, why: "says no loft insulation" },
  { field: "roofType", re: /hip(ped)? roof/i, value: "hip", conf: 0.9, why: "mentions a hipped roof" },
  { field: "roofType", re: /pitched roof|gable/i, value: "gable", conf: 0.9, why: "mentions a pitched roof" },
  { field: "roofType", re: /flat roof/i, value: "flat", conf: 0.9, why: "mentions a flat roof" },
  { field: "roofType", re: /\b(top[- ]floor|penthouse|under the roof|top level|upper floor)\b/i, value: "flat", conf: 0.92, why: "top floor flats have a roof above, not another dwelling" },
  { field: "roofType", re: /\b(ground[- ]floor)\b/i, value: "dwelling_above", conf: 0.95, why: "ground floor flat has homes above" },
];

const field = (value: string | number, confidence: number, source: FieldSource, evidence: string, quote?: string): ExtractedField => ({ value, confidence, source, evidence, quote });

export const rulesExtractor: Extractor = async (inputs) => {
  const fields = Object.fromEntries(
    Object.entries(DEFAULTS).map(([k, v]) => [k, field(v, 0.35, "default", "Typical for UK homes; please check")]),
  ) as Record<FieldKey, ExtractedField>;

  const hasPhoto = inputs.some((i) => i.kind === "PHOTO");
  const hasPlan = inputs.some((i) => i.kind === "PLAN");
  if (hasPhoto) {
    // Placeholder for the omni decision model: it will read storeys, roof, glazing frames and panels.
    fields.storeys = field(2, 0.62, "photo", "Two rows of windows on the façade (placeholder vision)");
    fields.roofType = field("gable", 0.6, "photo", "Pitched roof with gable end visible (placeholder vision)");
  }
  if (hasPlan) fields.floorAreaM2 = field(85, 0.55, "plan", "Floor plan uploaded (placeholder plan reader)");

  for (const input of inputs) {
    if (!input.text) continue;
    const source: FieldSource = input.kind === "VOICE" ? "voice" : "text";
    const seen = new Set<FieldKey>();
    for (const r of RULES) {
      if (seen.has(r.field)) continue; // first matching rule per field wins
      const m = input.text.match(r.re);
      if (!m) continue;
      seen.add(r.field);
      const value = typeof r.value === "function" ? r.value(m) : r.value;
      if (r.conf >= fields[r.field].confidence) fields[r.field] = field(value, r.conf, source, `${source === "voice" ? "Voice note" : "Your description"} ${r.why}`, m[0]);
    }
  }

  // Keep the record internally consistent.
  if (fields.propertyType.value === "flat" && fields.builtForm.source === "default")
    fields.builtForm = field("flat", 0.8, fields.propertyType.source, "Flats are part of a block");
  if (fields.propertyType.value === "flat" && fields.roofType.source === "default")
    fields.roofType = field("dwelling_above", 0.5, "default", "Most flats have another home above");
  if (fields.propertyType.value === "bungalow" && fields.storeys.source === "default")
    fields.storeys = field(1, 0.85, fields.propertyType.source, "Bungalows are single storey");
  if (fields.solarPv.value === "yes" && fields.roofType.value === "dwelling_above")
    fields.solarPv = field("no", 0.4, "default", "No roof of your own for panels");

  const conflicts: Conflict[] = [];
  if (fields.wallType.value === "solid" && fields.ageBand.value === "2012_plus")
    conflicts.push({ field: "wallType", message: "Solid walls are rare in homes built after 2012. Which is right?" });
  if (fields.heating.value === "heat_pump" && fields.glazing.value === "single")
    conflicts.push({ field: "glazing", message: "Single glazing with a heat pump is unusual. Can you double-check?" });

  const models = ["rules-v0"];
  if (hasPhoto) models.push("vision-placeholder");
  return { fields, conflicts, models };
};

export const extract: Extractor = rulesExtractor;

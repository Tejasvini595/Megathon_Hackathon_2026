import type { Conflict, ExtractedField, ExtractionResult, FieldKey, FieldSource, FieldValue, PropertyRecord } from "./fields";
import { FIELDS } from "./fields";
import { bandOfSap, EPC_BANDS, sapInBand } from "./epc";
import { panelsToKw, SOLAR_KW_PER_PANEL } from "./solar";
import type { EpcBand } from "@/lib/twin/types";

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

const DEFAULTS: Record<FieldKey, FieldValue> = {
  propertyType: "house",
  builtForm: "semi",
  storeys: 2,
  flatLevel: "mid",
  blockStoreys: 4,
  ageBand: "1930_1949",
  floorAreaM2: 85,
  rooms: 4,
  wallType: "cavity",
  wallInsulation: "none",
  roofType: "gable",
  loftInsulation: "some",
  flatRoofInsulation: "none",
  floorType: "solid",
  floorInsulation: "none",
  glazing: "double",
  heating: "gas_boiler",
  boilerAge: "before_2005",
  controls: "thermostat_trvs",
  solarPv: "no",
  solarKw: 3.5,
  epcBand: "unknown",
};

/** Optional fields have no default: they stay null until the user or the text gives them. */
const OPTIONAL_KEYS = FIELDS.filter((f) => "optional" in f).map((f) => f.key) as FieldKey[];

type Value = string | number | null;

/** A rule returns null from `value` to say the text matched but does not settle the field. */
type Rule = { field: FieldKey; re: RegExp; value: Value | ((m: RegExpMatchArray) => Value); conf: number; why: string };

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const NUM = "\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten";
const num = (s: string) => NUMBER_WORDS[s.toLowerCase()] ?? Number(s);

/** The age band a build year falls in. */
export function bandOfYear(y: number): string {
  const edges: [number, string][] = [[1900, "pre1900"], [1930, "1900_1929"], [1950, "1930_1949"], [1967, "1950_1966"], [1976, "1967_1975"], [1983, "1976_1982"], [1991, "1983_1990"], [1996, "1991_1995"], [2003, "1996_2002"], [2007, "2003_2006"], [2012, "2007_2011"], [2022, "2012_2021"]];
  return edges.find(([until]) => y < until)?.[1] ?? "2022_plus";
}

/** The loft insulation category for a depth in mm. */
export const loftCategory = (mm: number) => (mm <= 0 ? "none" : mm < 100 ? "thin" : mm < 200 ? "some" : "thick");

const BUILT = String.raw`(?:built|build|finished|completed|constructed|dates? from|dating from)\b[^.,;]{0,25}?`;
const YEAR = String.raw`\b(1[89]\d\d|20[0-2]\d)\b`;

/** A decade maps to the band around its middle; the ones that straddle a band edge get less confidence. */
const decadeBand = (decade: number) => bandOfYear(decade + 5);

const RULES: Rule[] = [
  { field: "propertyType", re: /\bbungalow\b/i, value: "bungalow", conf: 0.95, why: "mentions a bungalow" },
  { field: "propertyType", re: /\bmaisonette\b/i, value: "maisonette", conf: 0.95, why: "mentions a maisonette" },
  { field: "propertyType", re: /\b(flat|apartment)\b(?![- ]roof)/i, value: "flat", conf: 0.93, why: "mentions a flat" },
  { field: "propertyType", re: /\b(house|cottage|townhouse)\b/i, value: "house", conf: 0.85, why: "mentions a house" },
  { field: "builtForm", re: /\b(flat|apartment|maisonette)\b(?![- ]roof)/i, value: "flat", conf: 0.9, why: "a flat is part of a block" },
  { field: "builtForm", re: /\bsemi\b|semi-detached/i, value: "semi", conf: 0.94, why: "says semi-detached" },
  { field: "builtForm", re: /\bend[- ]terrace|end of terrace/i, value: "end_terrace", conf: 0.93, why: "says end terrace" },
  { field: "builtForm", re: /\b(mid[- ])?terrace(d)?\b|\b\d up,? \d down\b/i, value: "mid_terrace", conf: 0.8, why: "says terrace" },
  { field: "builtForm", re: /\bdetached\b/i, value: "detached", conf: 0.9, why: "says detached" },
  { field: "storeys", re: /\b(one|single)[- ]stor(e)?y\b/i, value: 1, conf: 0.9, why: "says single storey" },
  { field: "storeys", re: /\b(?:(three|3)[- ]stor(?:e)?y(?![- ]?(?:block|building))|over (?:three|3) stor(?:e)?ys)/i, value: 3, conf: 0.9, why: "says three storeys" },
  { field: "storeys", re: /\b(?:(two|2)[- ]stor(?:e)?y(?![- ]?(?:block|building))|\d up,? \d down|over (?:two|2) (?:stor(?:e)?ys|floors))/i, value: 2, conf: 0.85, why: "says two storeys" },
  { field: "floorAreaM2", re: /\b(\d{2,3})\s*(m2|m²|sq ?m|square met)/i, value: (m) => Number(m[1]), conf: 0.92, why: "states floor area" },
  { field: "floorAreaM2", re: /\b(\d{3,4})\s*(sq\.? ?ft|square f)/i, value: (m) => Math.round(Number(m[1]) * 0.0929), conf: 0.85, why: "states floor area in square feet" },
  { field: "ageBand", re: new RegExp(`${BUILT}${YEAR}`, "i"), value: (m) => bandOfYear(Number(m[1])), conf: 0.92, why: "gives the year it was built" },
  { field: "ageBand", re: new RegExp(`${YEAR}[- ]build\\b`, "i"), value: (m) => bandOfYear(Number(m[1])), conf: 0.9, why: "gives the build year" },
  { field: "ageBand", re: /\bgeorgian|\bvictorian|\bregency\b/i, value: "pre1900", conf: 0.85, why: "Georgian or Victorian era" },
  { field: "ageBand", re: /\bedwardian\b/i, value: "1900_1929", conf: 0.85, why: "Edwardian era" },
  { field: "ageBand", re: /\binter-?war\b/i, value: "1930_1949", conf: 0.8, why: "inter-war" },
  { field: "ageBand", re: /\bpost-?war\b/i, value: "1950_1966", conf: 0.6, why: "post-war" },
  { field: "ageBand", re: /\b((?:1960|1970|1980|1990|2000|2010))s\b/, value: (m) => decadeBand(Number(m[1])), conf: 0.6, why: "gives the decade, which spans two age bands" },
  { field: "ageBand", re: /\b((?:18|19|20)\d0)s\b/, value: (m) => decadeBand(Number(m[1])), conf: 0.8, why: "gives the decade" },
  { field: "ageBand", re: /\b(?:the |in the )'?([3-9]0)s\b/i, value: (m) => decadeBand(1900 + Number(m[1])), conf: 0.65, why: "gives the decade" },
  { field: "ageBand", re: /\bnew[- ]build|brand new/i, value: "2012_2021", conf: 0.6, why: "says new build" },
  { field: "wallType", re: /\bstone[- ]?(walls?|built|house|cottage)|\bsolid stone/i, value: "stone", conf: 0.88, why: "mentions stone walls" },
  { field: "wallType", re: /\bsolid (brick|wall)/i, value: "solid_brick", conf: 0.85, why: "mentions solid brick walls" },
  { field: "wallType", re: /\bcavity\b/i, value: "cavity", conf: 0.88, why: "mentions cavity walls" },
  { field: "wallType", re: /\btimber[- ]frame/i, value: "timber", conf: 0.88, why: "mentions timber frame" },
  { field: "wallType", re: /\bsystem[- ]built|\bprefab|\bairey|\bno[- ]fines|concrete panel/i, value: "system", conf: 0.8, why: "mentions system-built walls" },
  { field: "wallInsulation", re: /(cavity|walls?)\b[^.]{0,25}\b(no fill|never been (insulated|filled)|un-?insulated|not (been )?(insulated|filled)|no insulation|empty)|\bno (wall )?insulation\b|\buninsulated walls/i, value: "none", conf: 0.8, why: "says the walls have no insulation" },
  { field: "wallInsulation", re: /insulation[^.]{0,60}(front rooms|one side|part of|only)|part(ly|ially) insulated|some wall insulation/i, value: "partial", conf: 0.8, why: "says the walls are partly insulated" },
  { field: "wallInsulation", re: /(cavity|walls?)\b[^.]{0,30}\b(filled|insulated|insulation)|external wall insulation|internal wall insulation|fully insulated|insulated (cavity )?walls/i, value: "full", conf: 0.85, why: "says walls are insulated" },
  { field: "glazing", re: /some double|partly double|part(ially)? double|mix of (single|double)|windows are a mix|a mix\b/i, value: "partial_double", conf: 0.85, why: "says mixed glazing" },
  { field: "glazing", re: /mostly double|double[- ]glazed (apart|except|bar)|double[- ]glazing (apart|except|bar)/i, value: "mostly_double", conf: 0.85, why: "says mostly double glazed" },
  { field: "glazing", re: /single[- ]glaz|single[- ]pane/i, value: "single", conf: 0.92, why: "says single glazing" },
  { field: "glazing", re: /triple[- ]glaz/i, value: "triple", conf: 0.92, why: "says triple glazing" },
  { field: "glazing", re: /high[- ]performance (glaz|window|double)|low[- ]?e\b|argon|a-rated windows/i, value: "high_performance", conf: 0.85, why: "mentions high-performance glazing" },
  { field: "glazing", re: /double[- ]?glaz|\bwindows?\b[^.]{0,40}\bdouble\b|\bdouble\b[^.]{0,15}\bwindows?\b|\bupvc\b/i, value: "double", conf: 0.9, why: "says double glazing" },
  { field: "heating", re: /ground[- ]source|\bgshp\b/i, value: "heat_pump_ground", conf: 0.93, why: "mentions a ground source heat pump" },
  { field: "heating", re: /air[- ]source|\bashp\b/i, value: "heat_pump_air", conf: 0.93, why: "mentions an air source heat pump" },
  { field: "heating", re: /heat pump/i, value: "heat_pump_air", conf: 0.75, why: "mentions a heat pump; most are air source" },
  { field: "heating", re: /storage heater|night storage/i, value: "electric_storage", conf: 0.93, why: "mentions storage heaters" },
  { field: "heating", re: /electric (heater|heating|radiator|panel)|panel heaters|all[- ]electric/i, value: "electric_room", conf: 0.88, why: "mentions electric heating" },
  { field: "heating", re: /warm[- ]air/i, value: "gas_warm_air", conf: 0.8, why: "mentions warm air heating" },
  { field: "heating", re: /gas (room |wall )?heaters?\b/i, value: "gas_room_heaters", conf: 0.8, why: "mentions gas room heaters" },
  { field: "heating", re: /\boil\b|kerosene/i, value: "oil_boiler", conf: 0.85, why: "mentions oil" },
  { field: "heating", re: /communal (heating|boiler)|district heat|heat network|community heating/i, value: "heat_network", conf: 0.88, why: "mentions a heat network" },
  { field: "heating", re: /solid fuel|\bcoal\b|\baga\b|biomass|wood pellet|log boiler/i, value: "solid_fuel", conf: 0.8, why: "mentions solid fuel" },
  { field: "heating", re: /\b(gas|combi|boiler)\b/i, value: "gas_boiler", conf: 0.88, why: "mentions a gas boiler" },
  { field: "boilerAge", re: /(?:boiler|combi)\b[^.]{0,60}?\b((?:19|20)\d\d)\b/i, value: (m) => (Number(m[1]) >= 2005 ? "from_2005" : "before_2005"), conf: 0.85, why: "dates the boiler" },
  { field: "boilerAge", re: /(?:boiler|combi)\b[^.]{0,20}?\b(\d{1,2})[- ]years?[- ]old/i, value: (m) => (2026 - Number(m[1]) >= 2005 ? "from_2005" : "before_2005"), conf: 0.8, why: "gives the boiler's age" },
  { field: "boilerAge", re: /condensing|(?:new|replacement) (?:boiler|combi)|(?:boiler|combi)\b[^.]{0,30}\b(?:new|replaced) (?:last|this) (?:year|winter|summer)/i, value: "from_2005", conf: 0.8, why: "a condensing or new boiler is from 2005 or later" },
  { field: "boilerAge", re: /(?:original|old|ancient|ageing|aging) (?:boiler|combi)|boiler[^.]{0,20}\b(?:original|ancient)/i, value: "before_2005", conf: 0.6, why: "describes an old boiler" },
  { field: "controls", re: /(?<!no |not |nothing )smart (thermostat|heating|controls)|\bhive\b|\bnest\b|\btado\b/i, value: "smart", conf: 0.92, why: "mentions smart controls" },
  { field: "controls", re: /\btrvs?\b|thermostatic|radiator valves/i, value: "thermostat_trvs", conf: 0.85, why: "mentions TRVs" },
  { field: "controls", re: /\bno (heating )?controls\b|manual(ly)? (control|turn)/i, value: "none", conf: 0.8, why: "says no controls" },
  { field: "controls", re: /programmer|\btimer\b/i, value: "programmer", conf: 0.8, why: "mentions a timer" },
  { field: "controls", re: /\b(room )?thermostat\b/i, value: "thermostat_trvs", conf: 0.55, why: "mentions a thermostat; assumes radiator valves too" },
  { field: "solarPv", re: /\bno (solar|pv|panels)|without (solar|pv)|\bnot (got )?(any )?solar|no photovoltaic/i, value: "no", conf: 0.88, why: "says no solar" },
  { field: "solarPv", re: /solar|photovoltaic|\bpv\b/i, value: "yes", conf: 0.85, why: "mentions solar" },
  { field: "solarKw", re: /(\d+(?:\.\d+)?)\s*kw(?:p)?\b[^.]{0,30}(?:solar|pv|panels|array)|(?:solar|pv|array)\b[^.]{0,25}?(\d+(?:\.\d+)?)\s*kw/i, value: (m) => Number(m[1] ?? m[2]), conf: 0.9, why: "states the solar size" },
  { field: "solarKw", re: new RegExp(`(\\d{1,2})\\s*(?:solar\\s*|pv\\s*)?panels?\\b`, "i"), value: (m) => panelsToKw(Number(m[1])), conf: 0.8, why: `counts the panels (at ${SOLAR_KW_PER_PANEL} kW each)` },
  { field: "loftInsulation", re: /\bloft\b[^.]{0,60}?(\d{2,3})\s*mm|(\d{2,3})\s*mm[^.]{0,30}\bloft\b/i, value: (m) => loftCategory(Number(m[1] ?? m[2])), conf: 0.9, why: "states loft insulation depth" },
  { field: "loftInsulation", re: /no loft insulation|loft (is |was )?(not|un)insulated|nothing in the loft/i, value: "none", conf: 0.85, why: "says no loft insulation" },
  { field: "loftInsulation", re: /(barely|hardly) any[^.]{0,20}loft|thin loft insulation|loft[^.]{0,30}\bthin\b/i, value: "thin", conf: 0.65, why: "says the loft insulation is thin" },
  { field: "loftInsulation", re: /(well|fully|deeply) insulated loft|loft[^.]{0,20}(fully|well) insulated|plenty of[^.]{0,15}loft|deep loft insulation/i, value: "thick", conf: 0.65, why: "says the loft is well insulated" },
  { field: "roofType", re: /hip(ped)? roof/i, value: "hip", conf: 0.9, why: "mentions a hipped roof" },
  { field: "roofType", re: /pitched roof|roof is pitched|gable/i, value: "gable", conf: 0.9, why: "mentions a pitched roof" },
  { field: "roofType", re: /flat roof/i, value: "flat", conf: 0.9, why: "mentions a flat roof" },
  { field: "flatRoofInsulation", re: /insulated flat roof|flat roof[^.]{0,30}insulat|warm roof/i, value: "full", conf: 0.75, why: "says the flat roof is insulated" },
  { field: "floorType", re: /suspended (timber )?floor|(timber|wooden) (ground )?floor ?boards|floorboards|beam and block|void under the floor/i, value: "suspended", conf: 0.85, why: "describes a suspended timber floor" },
  { field: "floorType", re: /solid (concrete )?(ground )?floor|concrete floor|slab/i, value: "solid", conf: 0.85, why: "describes a solid floor" },
  { field: "floorInsulation", re: /\bno (under)?floor insulation|(un|non)[- ]?insulated (ground )?floors?/i, value: "none", conf: 0.8, why: "says the floor is not insulated" },
  { field: "floorInsulation", re: /(under)?floor insulation|insulated (ground )?floors?|insulation (under|beneath) (it|the floor)|floor\b[^.]{0,40}\bwith insulation/i, value: "full", conf: 0.8, why: "says the floor is insulated" },
  { field: "flatLevel", re: /\b(top[- ]floor|penthouse|top level|top (two|2) floors)\b/i, value: "top", conf: 0.92, why: "says top floor" },
  { field: "flatLevel", re: /\b(ground[- ]floor|basement|lower[- ]ground)\b/i, value: "ground", conf: 0.92, why: "says ground floor" },
  { field: "flatLevel", re: /\b(first|second|third|fourth|fifth|sixth|middle|\d+(st|nd|rd|th))[- ]floor\b/i, value: "mid", conf: 0.75, why: "names a middle floor" },
  { field: "blockStoreys", re: /\b(\d{1,2})[- ]stor(e)?y\b[^.,]{0,15}\b(block|building)/i, value: (m) => Number(m[1]), conf: 0.9, why: "states the block height" },
  { field: "blockStoreys", re: /\b(\d{1,2}) (floors|storeys) (in total|in the (block|building))/i, value: (m) => Number(m[1]), conf: 0.9, why: "states the block height" },
  { field: "blockStoreys", re: new RegExp(`\\b(${NUM})\\s+storey (?:block|building)`, "i"), value: (m) => num(m[1]), conf: 0.9, why: "states the block height" },
  { field: "epcBand", re: /\b(?:EPC|epc|SAP|energy (?:performance )?(?:certificate|rating))\b[^.\d]{0,25}?\b(?:band|rating|grade|is|of|at|rated)?\s*([A-G])\b(?![a-z'])/, value: (m) => m[1], conf: 0.92, why: "states the EPC band" },
  { field: "epcBand", re: /\b(?:[Rr]ated|[Bb]and|[Gg]rade)\s+([A-G])\b(?![a-z'])/, value: (m) => m[1], conf: 0.8, why: "states a rating band" },
  { field: "sapScore", re: /\b(?:SAP|EPC|energy (?:performance )?(?:certificate|rating))\b(?:\s+(?:rating|score|points?|band))?\s*(?:of|is|:|at)?\s*(\d{1,3})\b|\b(?:EPC|SAP)\b[^.]{0,40}?\b(?:rating|score|points?)\s*(?:of|is|:|at)?\s*(\d{1,3})\b/i, value: (m) => {
    const sap = Number(m[1] ?? m[2]);
    return sap >= 1 && sap <= 150 ? sap : null;
  }, conf: 0.92, why: "states the EPC score" },
  { field: "thermostatC", re: /(?:thermostat|heating|house|keep(?:\s+it)?|set|warm|temperature)[^.]{0,25}?\b(1[4-9]|2[0-6])(\.5)?\s*(?:°|degrees|deg\b|c\b)/i, value: (m) => Number(m[1]) + (m[2] ? 0.5 : 0), conf: 0.85, why: "states the usual temperature" },
  { field: "currentValueGbp", re: /(?:worth|valued?(?: at)?|value of|valuation)[^£\d]{0,15}£\s?(\d[\d,]*(?:\.\d+)?)\s*(k|m)?\b/i, value: (m) => {
    const v = Number(m[1].replace(/,/g, "")) * (m[2]?.toLowerCase() === "k" ? 1000 : m[2]?.toLowerCase() === "m" ? 1e6 : 1);
    return v >= 30000 && v <= 5e6 ? v : null;
  }, conf: 0.85, why: "states the home's value" },
];

/** Bedrooms plus reception rooms; when the text doesn't say how many living rooms, one is assumed. */
function roomsFrom(text: string): { value: number; conf: number; why: string; quote: string } | null {
  const bed = text.match(new RegExp(`\\b(${NUM})[\\s-]*(?:bed|beds|bedrooms?|bedroomed)\\b`, "i"));
  const reception = text.match(new RegExp(`\\b(${NUM}|a|an)\\s+(?:reception|living|sitting)\\s*rooms?\\b`, "i"));
  const stated = text.match(/\b(\d{1,2})\s+(?:habitable\s+)?rooms\b/i);
  if (stated && !bed) return { value: Number(stated[1]), conf: 0.85, why: "states the room count", quote: stated[0] };
  if (!bed) return null;
  const beds = num(bed[1]);
  if (reception) {
    const living = /^an?$/i.test(reception[1]) ? 1 : num(reception[1]);
    return { value: beds + living, conf: 0.93, why: `counts ${beds} bedrooms and ${living} living rooms`, quote: `${bed[0]}, ${reception[0]}` };
  }
  return { value: beds + 1, conf: 0.7, why: `counts ${beds} bedrooms and assumes one living room`, quote: bed[0] };
}

/** Whether the typed band and score disagree, e.g. "EPC C, score 47". */
const sapMatchesBand = (sap: number, band: string) => band === "unknown" || (EPC_BANDS.includes(band as EpcBand) && sapInBand(sap, band as EpcBand));

const OLD_AGE_BANDS: Record<string, string> = { "1967_1982": "1967_1975", "1983_1995": "1983_1990", "1996_2011": "2003_2006", "2012_plus": "2012_2021" };
const OLD_HEATING: Record<string, string> = { heat_pump: "heat_pump_air" };

/**
 * Fills fields missing from older saved records and migrates retired ones (bedrooms, loft depth, old
 * age bands, solid walls, one heat pump), so every record has every field the engine needs.
 */
export function normaliseRecord(r: Record<string, unknown>): PropertyRecord {
  const o = { ...r };
  if (o.rooms == null && typeof o.bedrooms === "number") o.rooms = Math.min(15, Math.max(1, o.bedrooms + 1));
  if (o.loftInsulation == null && typeof o.loftInsulationMm === "number") o.loftInsulation = loftCategory(o.loftInsulationMm);
  if (typeof o.ageBand === "string") o.ageBand = OLD_AGE_BANDS[o.ageBand] ?? o.ageBand;
  if (o.wallType === "solid") o.wallType = "solid_brick";
  if (typeof o.heating === "string") o.heating = OLD_HEATING[o.heating] ?? o.heating;
  if (o.roofType === "dwelling_above") Object.assign(o, { roofType: "flat", flatLevel: r.flatLevel ?? "mid" });
  for (const gone of ["bedrooms", "loftInsulationMm", "secondaryHeating"]) delete o[gone];
  const out: Record<string, unknown> = { ...DEFAULTS };
  for (const [k, v] of Object.entries(o)) if (v != null) out[k] = v;
  for (const k of OPTIONAL_KEYS) out[k] ??= null;
  return out as PropertyRecord;
}

const field = (value: FieldValue, confidence: number, source: FieldSource, evidence: string, quote?: string): ExtractedField => ({ value, confidence, source, evidence, quote });

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
    const by = source === "voice" ? "Voice note" : "Your description";
    const set = (key: FieldKey, value: FieldValue, conf: number, why: string, quote?: string) => {
      if (!(key in fields) || conf >= fields[key].confidence) fields[key] = field(value, conf, source, `${by} ${why}`, quote);
    };
    const seen = new Set<FieldKey>();
    for (const r of RULES) {
      if (seen.has(r.field)) continue; // first matching rule per field wins
      const m = input.text.match(r.re);
      if (!m) continue;
      const value = typeof r.value === "function" ? r.value(m) : r.value;
      if (value == null) continue;
      seen.add(r.field);
      set(r.field, value, r.conf, r.why, m[0]);
    }
    const rooms = roomsFrom(input.text);
    if (rooms) set("rooms", Math.min(15, Math.max(1, rooms.value)), rooms.conf, rooms.why, rooms.quote);
  }

  // Keep the record internally consistent.
  if (fields.propertyType.value === "flat" && fields.builtForm.source === "default")
    fields.builtForm = field("flat", 0.8, fields.propertyType.source, "Flats are part of a block");
  if (fields.propertyType.value === "maisonette" && fields.builtForm.source === "default")
    fields.builtForm = field("flat", 0.8, fields.propertyType.source, "Maisonettes are part of a larger building");
  if (fields.propertyType.value === "flat" && fields.storeys.source === "default")
    fields.storeys = field(1, 0.8, fields.propertyType.source, "Most flats are on one floor");
  if (fields.propertyType.value === "maisonette" && fields.storeys.source === "default")
    fields.storeys = field(2, 0.8, fields.propertyType.source, "Maisonettes usually span two floors");
  if (fields.propertyType.value === "bungalow")
    fields.storeys = field(1, 0.95, fields.propertyType.source, "Bungalows are single storey");
  if (fields.solarKw.source !== "default" && fields.solarPv.source === "default")
    fields.solarPv = field("yes", 0.85, fields.solarKw.source, "You gave a solar size");

  const sap = fields.sapScore as ExtractedField | undefined;
  if (sap && fields.epcBand.source === "default") {
    fields.epcBand = field(bandOfSap(Number(sap.value)), 0.88, sap.source, "The band that goes with your EPC score");
  }

  const conflicts: Conflict[] = [];
  if (fields.wallType.value === "solid_brick" && fields.ageBand.value === "2022_plus")
    conflicts.push({ field: "wallType", message: "Solid walls are rare in homes built after 2022. Which is right?" });
  if (String(fields.heating.value).startsWith("heat_pump") && ["single", "partial_double"].includes(String(fields.glazing.value)))
    conflicts.push({ field: "glazing", message: "Single glazing with a heat pump is unusual. Can you double-check?" });
  if (sap && fields.epcBand.source !== "default" && !sapMatchesBand(Number(sap.value), String(fields.epcBand.value)))
    conflicts.push({ field: "sapScore", message: `A score of ${sap.value} isn't in band ${fields.epcBand.value}. Which is right?` });

  const models = ["rules-v0"];
  if (hasPhoto) models.push("vision-placeholder");
  return { fields, conflicts, models };
};

export const extract: Extractor = rulesExtractor;

/**
 * The typed property record the user confirms. Every decision model (Jev, omni models, rules)
 * must answer in these categories so outputs stay schema-valid and comparable.
 */

export type FieldSource = "photo" | "text" | "plan" | "voice" | "postcode" | "map" | "default";

export type FieldValue = string | number | string[];

/** Loosely typed record for visibility rules (FIELDS can't refer to the type derived from itself). */
type AnyRecord = Partial<Record<string, FieldValue | null>>;

/** `when` hides a field that doesn't apply to this home (e.g. the floor a flat is on, for a house). */
type Applies = { when?: (r: AnyRecord) => boolean };

/** `optional` fields may be null (not given); every other field must have a value before the engine runs. */
type Meta = Applies & { hint?: string; optional?: true };

export type FieldDef = Meta &
  (
    | { key: string; label: string; group: Group; kind: "enum"; options: { value: string; label: string }[] }
    | { key: string; label: string; group: Group; kind: "multi"; options: { value: string; label: string }[] }
    | { key: string; label: string; group: Group; kind: "number"; unit?: string; min: number; max: number; step?: number }
  );

export type Group = "Building" | "Walls, roof & windows" | "Heating & power" | "Rating & extras";

export const GROUPS: Group[] = ["Building", "Walls, roof & windows", "Heating & power", "Rating & extras"];

const opts = (...pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));

export const isFlatLike = (r: AnyRecord) => r.propertyType === "flat" || r.propertyType === "maisonette";
const hasOwnRoof = (r: AnyRecord) => !isFlatLike(r) || r.flatLevel === "top";
/** Has a floor over the ground (not another home). */
const onGround = (r: AnyRecord) => !isFlatLike(r) || r.flatLevel === "ground";

export const FIELDS = [
  { key: "propertyType", label: "Property type", group: "Building", kind: "enum", options: opts(["house", "House"], ["bungalow", "Bungalow"], ["flat", "Flat"], ["maisonette", "Maisonette"]) },
  { key: "builtForm", label: "Attached to", group: "Building", kind: "enum", options: opts(["detached", "Detached"], ["semi", "Semi-detached"], ["end_terrace", "End terrace"], ["mid_terrace", "Mid terrace"], ["flat", "Part of a block"]) },
  { key: "storeys", label: "Storeys", group: "Building", kind: "number", min: 1, max: 4, when: (r) => r.propertyType !== "bungalow" },
  { key: "flatLevel", label: "Which floor", group: "Building", kind: "enum", options: opts(["ground", "Ground floor"], ["mid", "Middle floor"], ["top", "Top floor"]), when: isFlatLike },
  { key: "blockStoreys", label: "Floors in the building", group: "Building", kind: "number", min: 2, max: 30, when: isFlatLike },
  {
    key: "ageBand",
    label: "Built",
    group: "Building",
    kind: "enum",
    options: opts(
      ["pre1900", "Before 1900"], ["1900_1929", "1900–1929"], ["1930_1949", "1930–1949"], ["1950_1966", "1950–1966"], ["1967_1975", "1967–1975"],
      ["1976_1982", "1976–1982"], ["1983_1990", "1983–1990"], ["1991_1995", "1991–1995"], ["1996_2002", "1996–2002"], ["2003_2006", "2003–2006"],
      ["2007_2011", "2007–2011"], ["2012_2021", "2012–2021"], ["2022_plus", "2022 or later"],
    ),
  },
  { key: "floorAreaM2", label: "Floor area", group: "Building", kind: "number", unit: "m²", min: 20, max: 500, step: 5 },
  { key: "rooms", label: "Rooms", hint: "Bedrooms and living rooms, not kitchens or bathrooms", group: "Building", kind: "number", min: 1, max: 15 },
  { key: "wallType", label: "Walls", group: "Walls, roof & windows", kind: "enum", options: opts(["cavity", "Cavity"], ["solid_brick", "Solid brick"], ["stone", "Stone"], ["timber", "Timber frame"], ["system", "System built"]) },
  { key: "wallInsulation", label: "Wall insulation", group: "Walls, roof & windows", kind: "enum", options: opts(["none", "None"], ["partial", "Partial"], ["full", "Insulated"]) },
  { key: "roofType", label: "Roof", group: "Walls, roof & windows", kind: "enum", options: opts(["gable", "Pitched, gable"], ["hip", "Pitched, hipped"], ["flat", "Flat"]), when: hasOwnRoof },
  {
    key: "loftInsulation",
    label: "Loft insulation",
    group: "Walls, roof & windows",
    kind: "enum",
    options: opts(["none", "None"], ["thin", "Thin, under 100 mm"], ["some", "Some, 100–199 mm"], ["thick", "Thick, 200 mm or more"]),
    when: (r) => hasOwnRoof(r) && r.roofType !== "flat",
  },
  { key: "flatRoofInsulation", label: "Roof insulation", group: "Walls, roof & windows", kind: "enum", options: opts(["none", "None"], ["partial", "Some"], ["full", "Insulated"]), when: (r) => hasOwnRoof(r) && r.roofType === "flat" },
  { key: "floorType", label: "Ground floor", group: "Walls, roof & windows", kind: "enum", options: opts(["solid", "Solid (concrete)"], ["suspended", "Suspended timber"]), when: onGround },
  { key: "floorInsulation", label: "Floor insulation", group: "Walls, roof & windows", kind: "enum", options: opts(["none", "None"], ["partial", "Some"], ["full", "Insulated"]), when: onGround },
  {
    key: "glazing",
    label: "Glazing",
    group: "Walls, roof & windows",
    kind: "enum",
    options: opts(["single", "Single"], ["partial_double", "Some double"], ["mostly_double", "Mostly double"], ["double", "Double"], ["high_performance", "High-performance double"], ["triple", "Triple"]),
  },
  {
    key: "heating",
    label: "Main heating",
    group: "Heating & power",
    kind: "enum",
    options: opts(
      ["gas_boiler", "Gas boiler"], ["gas_warm_air", "Gas warm air"], ["gas_room_heaters", "Gas room heaters"], ["oil_boiler", "Oil boiler"],
      ["electric_storage", "Storage heaters"], ["electric_room", "Electric heaters"], ["heat_pump_air", "Air source heat pump"],
      ["heat_pump_ground", "Ground source heat pump"], ["heat_network", "Heat network"], ["solid_fuel", "Solid fuel"],
    ),
  },
  {
    key: "boilerAge",
    label: "Boiler fitted",
    hint: "Boilers fitted from April 2005 must be condensing",
    group: "Heating & power",
    kind: "enum",
    options: opts(["before_2005", "Before 2005"], ["from_2005", "2005 or later"]),
    when: (r) => r.heating === "gas_boiler",
  },
  { key: "controls", label: "Controls", group: "Heating & power", kind: "enum", options: opts(["none", "None"], ["programmer", "Timer only"], ["thermostat_trvs", "Thermostat + TRVs"], ["smart", "Smart or zoned"]) },
  { key: "solarPv", label: "Solar panels", group: "Heating & power", kind: "enum", options: opts(["no", "No"], ["yes", "Yes"]) },
  { key: "solarKw", label: "Solar size", hint: "On the inverter or installer paperwork; or count the panels", group: "Heating & power", kind: "number", unit: "kW", min: 0.3, max: 12, step: 0.1, when: (r) => r.solarPv === "yes" },
  {
    key: "epcBand",
    label: "EPC rating",
    hint: "On your Energy Performance Certificate",
    group: "Rating & extras",
    kind: "enum",
    options: opts(["A", "A"], ["B", "B"], ["C", "C"], ["D", "D"], ["E", "E"], ["F", "F"], ["G", "G"], ["unknown", "I don't know"]),
  },
  { key: "sapScore", label: "EPC score", hint: "The number next to the letter, e.g. 72", group: "Rating & extras", kind: "number", min: 1, max: 150, optional: true, when: (r) => r.epcBand != null && r.epcBand !== "unknown" },
  { key: "thermostatC", label: "Usual heating temperature", group: "Rating & extras", kind: "number", unit: "°C", min: 14, max: 26, step: 0.5, optional: true },
  { key: "currentValueGbp", label: "Home value", hint: "Roughly; unlocks the value estimate in pounds", group: "Rating & extras", kind: "number", unit: "£", min: 30000, max: 5000000, step: 5000, optional: true },
] as const satisfies readonly FieldDef[];

export type FieldKey = (typeof FIELDS)[number]["key"];

export type ExtractedField = {
  value: FieldValue;
  /** Calibrated probability from the decision model, 0-1. */
  confidence: number;
  source: FieldSource;
  /** Short human-readable reason, e.g. "uPVC frames visible on all front windows". */
  evidence: string;
  /** The exact words in the user's text that support this value, so the UI can point at them. */
  quote?: string;
};

export type Conflict = { field: FieldKey; message: string };

export type ExtractionResult = {
  fields: Record<FieldKey, ExtractedField>;
  conflicts: Conflict[];
  models: string[];
};

/** Metered energy, from monthly readings (preferred: the engine annualises them and reads their seasonal shape) or yearly totals. */
export type EnergyUsage = {
  months?: { month: string; elecKwh: number | null; gasKwh: number | null }[];
  annual?: { elecKwh: number; gasKwh: number };
  /** Heating fuels not on the electricity or gas meter. */
  oilLitres?: number;
  heatNetworkKwh?: number;
  otherFuelKwh?: number;
};

/** The record the engine reads once the user confirms. Optional fields are null when not given. */
export type PropertyRecord = Record<FieldKey, FieldValue | null> & { postcode?: string | null; usage?: EnergyUsage };

export function applies(key: FieldKey, r: Partial<PropertyRecord>) {
  const def: FieldDef | undefined = FIELDS.find((f) => f.key === key);
  return !def?.when || def.when(r as AnyRecord);
}

export function optionLabel(key: FieldKey, value: FieldValue) {
  const def = FIELDS.find((f) => f.key === key);
  if (!def) return String(value);
  if (def.kind === "number") return `${value}${"unit" in def && def.unit ? ` ${def.unit}` : ""}`;
  const label = (v: string) => def.options.find((o) => o.value === v)?.label ?? v;
  if (Array.isArray(value)) return value.length ? value.map(label).join(", ") : "None";
  return label(String(value));
}

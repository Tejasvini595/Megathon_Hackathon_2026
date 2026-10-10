/**
 * The typed property record the user confirms. Every decision model (Jev, omni models, rules)
 * must answer in these categories so outputs stay schema-valid and comparable.
 */

export type FieldSource = "photo" | "text" | "plan" | "voice" | "postcode" | "default";

export type FieldDef =
  | { key: string; label: string; group: Group; kind: "enum"; options: { value: string; label: string }[] }
  | { key: string; label: string; group: Group; kind: "number"; unit?: string; min: number; max: number; step?: number };

export type Group = "Building" | "Walls, roof & windows" | "Heating & power";

export const GROUPS: Group[] = ["Building", "Walls, roof & windows", "Heating & power"];

const opts = (...pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));

export const FIELDS = [
  { key: "propertyType", label: "Property type", group: "Building", kind: "enum", options: opts(["house", "House"], ["bungalow", "Bungalow"], ["flat", "Flat"], ["maisonette", "Maisonette"]) },
  { key: "builtForm", label: "Attached to", group: "Building", kind: "enum", options: opts(["detached", "Detached"], ["semi", "Semi-detached"], ["end_terrace", "End terrace"], ["mid_terrace", "Mid terrace"], ["flat", "Part of a block"]) },
  { key: "storeys", label: "Storeys", group: "Building", kind: "number", min: 1, max: 4 },
  { key: "ageBand", label: "Built", group: "Building", kind: "enum", options: opts(["pre1900", "Before 1900"], ["1900_1929", "1900–1929"], ["1930_1949", "1930–1949"], ["1950_1966", "1950–1966"], ["1967_1982", "1967–1982"], ["1983_1995", "1983–1995"], ["1996_2011", "1996–2011"], ["2012_plus", "2012 or later"]) },
  { key: "floorAreaM2", label: "Floor area", group: "Building", kind: "number", unit: "m²", min: 20, max: 400, step: 5 },
  { key: "bedrooms", label: "Bedrooms", group: "Building", kind: "number", min: 0, max: 8 },
  { key: "wallType", label: "Walls", group: "Walls, roof & windows", kind: "enum", options: opts(["cavity", "Cavity"], ["solid", "Solid brick or stone"], ["timber", "Timber frame"], ["system", "System built"]) },
  { key: "wallInsulation", label: "Wall insulation", group: "Walls, roof & windows", kind: "enum", options: opts(["none", "None"], ["partial", "Partial"], ["full", "Insulated"]) },
  { key: "roofType", label: "Roof", group: "Walls, roof & windows", kind: "enum", options: opts(["gable", "Pitched, gable"], ["hip", "Pitched, hipped"], ["flat", "Flat"], ["dwelling_above", "Another home above"]) },
  { key: "loftInsulationMm", label: "Loft insulation", group: "Walls, roof & windows", kind: "number", unit: "mm", min: 0, max: 400, step: 25 },
  { key: "glazing", label: "Glazing", group: "Walls, roof & windows", kind: "enum", options: opts(["single", "Single"], ["partial_double", "Some double"], ["double", "Double"], ["triple", "Triple"]) },
  { key: "heating", label: "Main heating", group: "Heating & power", kind: "enum", options: opts(["gas_boiler", "Gas boiler"], ["oil_boiler", "Oil boiler"], ["electric_storage", "Storage heaters"], ["electric_room", "Electric heaters"], ["heat_pump", "Heat pump"], ["heat_network", "Heat network"]) },
  { key: "controls", label: "Controls", group: "Heating & power", kind: "enum", options: opts(["none", "None"], ["programmer", "Timer only"], ["thermostat_trvs", "Thermostat + TRVs"], ["smart", "Smart thermostat"]) },
  { key: "solarPv", label: "Solar panels", group: "Heating & power", kind: "enum", options: opts(["no", "No"], ["yes", "Yes"]) },
] as const satisfies readonly FieldDef[];

export type FieldKey = (typeof FIELDS)[number]["key"];

export type ExtractedField = {
  value: string | number;
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

/** The record the engine reads once the user confirms. */
export type PropertyRecord = Record<FieldKey, string | number> & { postcode?: string | null };

export function optionLabel(key: FieldKey, value: string | number) {
  const def = FIELDS.find((f) => f.key === key);
  if (!def) return String(value);
  if (def.kind === "number") return `${value}${"unit" in def && def.unit ? ` ${def.unit}` : ""}`;
  return def.options.find((o) => o.value === value)?.label ?? String(value);
}

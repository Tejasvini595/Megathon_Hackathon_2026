import type { RetrofitId } from "@/lib/twin/types";

/**
 * What-if phrasings with the retrofit set they should produce (letters: L loft, C cavity wall, S solid wall, F floor, G glazing,
 * T smart thermostat, H heat pump, P solar, B condensing boiler). The first three sets are ported from model/greenhome/whatif_eval.py
 * (gold written for a current selection of loft + glazing, "LG"); the rules parser was tuned on the first two, the LLM prompt on none.
 * "everything" means every measure except the condensing boiler, the rules parser's convention.
 */
const ID: Record<string, RetrofitId> = {
  L: "loft_insulation", C: "cavity_wall_insulation", S: "solid_wall_insulation", F: "floor_insulation", G: "double_glazing",
  T: "smart_thermostat", H: "heat_pump", P: "solar_pv", B: "condensing_boiler",
};
export const ids = (s: string) => [...s].map((c) => ID[c]);

export type Case = { set: string; kind: string; text: string; current: string; gold: string; unsupported?: string[]; neverEmptyCurrent?: boolean };

const ALL = "LCSFGTHP";
const minus = (...x: string[]) => [...ALL].filter((c) => !x.join("").includes(c)).join("");
const D = "LG";

const row = (set: string) => (kind: string, text: string, gold: string, unsupported: string[] = []): Case => ({ set, kind, text, current: D, gold, unsupported });
const t1 = row("rules-tuned-1"), t2 = row("rules-tuned-2"), h2 = row("rules-held-out");

export const PORTED: Case[] = [
  t1("plain", "what if I only add solar and loft insulation?", "LP"), t1("plain", "add solar", "P"), t1("plain", "just the heat pump", "H"), t1("plain", "smart controls", "T"),
  t1("plain", "double glazing and a smart thermostat", "GT"), t1("plain", "what about a new condensing boiler and glazing", "BG"), t1("plain", "loft insulation only", "L"),
  t1("plain", "floor insulation and cavity wall insulation", "FC"), t1("plain", "I want solar panels and a heat pump", "PH"), t1("plain", "only windows", "G"),
  t1("plain", "just roof insulation", "L"), t1("plain", "solid wall insulation", "S"),
  t1("generic", "wall insulation and floor insulation", "CSF"), t1("generic", "only insulation", "LCSF"), t1("generic", "all the insulation and a heat pump", "LCSFH"),
  t1("generic", "new windows and wall insulation", "GCS"), t1("generic", "something for the walls", "CS"),
  t1("everything", "what if I do everything", ALL), t1("everything", "everything except the heat pump", minus("H")), t1("everything", "do all of it but skip solar", minus("P")),
  t1("everything", "all except heat pump and solar", minus("HP")), t1("everything", "everything without insulation", minus("LCSF")), t1("everything", "all of it without the solar panels", minus("P")),
  t1("everything", "everything apart from windows", minus("G")), t1("everything", "the full package but not the heat pump", minus("H")), t1("everything", "every measure except smart controls", minus("T")),
  t1("negation", "without solar", "LG"), t1("negation", "heat pump but skip solar", "H"), t1("negation", "no double glazing", "L"), t1("negation", "skip the loft", "G"),
  t1("negation", "I don't want a heat pump", "LG"), t1("negation", "heat pump and solar but no glazing", "HP"), t1("negation", "add solar but not the heat pump", "P"),
  t1("negation", "without the thermostat", "LG"),
  t1("colloquial", "panels on the roof", "P"), t1("colloquial", "an air source heat pump", "H"), t1("colloquial", "get rid of the gas boiler and put in a heat pump", "H"),
  t1("colloquial", "thicker loft insulation", "L"), t1("colloquial", "replace the old windows", "G"), t1("colloquial", "a smarter heating thermostat", "T"),
  t1("colloquial", "insulate the cavity walls", "C"), t1("colloquial", "upgrade my boiler", "B"), t1("colloquial", "put PV on the roof and insulate the loft", "PL"),
  t1("colloquial", "stop the heat escaping through the floor", "F"), t1("colloquial", "cut my bills with better glazing", "G"),
  t1("unsupported", "solar panels with a battery", "P", ["battery"]), t1("unsupported", "add draught proofing", D, ["draught"]), t1("unsupported", "triple glazing please", "G", ["triple glazing"]),
  t1("unsupported", "LED lighting and loft insulation", "L", ["lighting"]), t1("unsupported", "a wind turbine", D, ["wind turbine"]), t1("unsupported", "ground source heat pump", "H", ["ground source"]),
  t1("unclear", "make my house better", D), t1("unclear", "what is best for me?", D), t1("unclear", "blah", D), t1("unclear", "can you explain my score", D), t1("unclear", "how much will it cost", D),
  t2("tuned-2", "can you check heat pump plus solar plus loft", "HPL"), t2("tuned-2", "I'd rather avoid the heat pump, do everything else", minus("H")),
  t2("tuned-2", "no solar please, just insulation", "LCSF"), t2("tuned-2", "everything but the thermostat", minus("T")), t2("tuned-2", "upgrade windows and loft", "GL"),
  t2("tuned-2", "what happens if I insulate the floor and the walls", "FCS"), t2("tuned-2", "everything, leave out the heat pump", minus("H")), t2("tuned-2", "a boiler replacement and a thermostat", "BT"),
  t2("tuned-2", "go big on solar", "P"), t2("tuned-2", "double glazed windows and an ASHP", "GH"), t2("tuned-2", "add triple glazing and a battery", "G", ["triple glazing", "battery"]),
  t2("tuned-2", "heat pump instead of the boiler", "H"), t2("tuned-2", "I only care about carbon so everything except solar", minus("P")), t2("tuned-2", "put a thermostat in", "T"),
  t2("tuned-2", "tell me a joke", D),
  h2("held-out", "put in solar and a heat pump but not new windows", "PH"), h2("held-out", "all measures except the floor", minus("F")), h2("held-out", "I'm only interested in loft and glazing", "LG"),
  h2("held-out", "skip everything except solar", "P"), h2("held-out", "a heat pump would be great, no thanks to solar", "H"), h2("held-out", "can we see what new windows and insulating the roof does", "GL"),
  h2("held-out", "just a thermostat upgrade", "T"), h2("held-out", "everything apart from the boiler", ALL), h2("held-out", "I'd like loft insulation, but without the floor", "L"),
  h2("held-out", "add panels, and leave the heat pump out", "P"), h2("held-out", "only the cheapest things", D), h2("held-out", "heat pump plus smart thermostat plus glazing, no solar", "HTG"),
  h2("held-out", "everything but heat pump and solar", minus("HP")), h2("held-out", "what happens if I do nothing", D), h2("held-out", "wall and loft insulation with new double glazing", "CSLG"),
];

/** Gold for a home with no measures selected: removals have nothing to remove and a request naming nothing leaves the selection empty. */
export function emptyCurrent(c: Case): Case | null {
  if (c.text === "only the cheapest things") return null;
  const derivedFromCurrent = (["negation", "unclear"].includes(c.kind) && [...c.gold].every((x) => D.includes(x))) || (c.kind === "unsupported" && c.gold === D);
  const nothing = c.text === "tell me a joke" || c.text === "what happens if I do nothing";
  return { ...c, current: "", gold: derivedFromCurrent || nothing ? "" : c.gold };
}

const x = (kind: string, text: string, current: string, gold: string, unsupported: string[] = []): Case => ({ set: "app phrasings (some are prompt examples)", kind, text, current, gold, unsupported });
export const APP_CASES: Case[] = [
  x("explain", "Why this score?", "", ""), x("explain", "Why this score?", "HP", "HP"), x("explain", "What should I do first?", "", ""), x("explain", "How can I improve my home?", "", ""),
  x("explain", "What does my score mean?", "", ""), x("explain", "Why would electricity go up with a heat pump?", "H", "H"),
  x("add", "What if I add solar?", "", "P"), x("add", "What if I add solar?", "H", "HP"), x("add", "What if I also add a heat pump?", "LG", "LGH"),
  x("remove", "without the heat pump", "HP", "P"), x("remove", "without the heat pump", "", ""), x("remove", "Now take out the loft insulation", "LG", "G"),
  x("only", "Just loft insulation", "H", "L"), x("unsupported", "Is it worth getting a wind turbine?", "", "", ["wind turbine"]),
];

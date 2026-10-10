"""Evaluation of the what-if parser (free text -> typed scenario).  python -m greenhome.whatif_eval [--llm]

The gold set is hand-written (55 requests in plain, generic-word, 'everything except', negated, colloquial, unsupported and unclear styles). The current selection
('default') is loft insulation + double glazing for every case. A case is correct when the parsed retrofit set equals the gold set; unsupported requests must also be
reported (recall). It is a small, author-written set: it shows where the rule parser breaks, it is not a benchmark of general language understanding, and the rules
were developed with these phrasings in view, so treat the rules' score as optimistic.
With --llm (needs ANTHROPIC_API_KEY) the Claude parser is scored on the same cases; its ids are validated against the catalogue, so it can never return a measure outside it."""
import argparse, json, sys
from . import config as C
from . import llm

D = ["loft_insulation", "double_glazing"]
ALL = [r for r in C.ORDER if r != "condensing_boiler"]
INS = ["loft_insulation", "cavity_wall_insulation", "solid_wall_insulation", "floor_insulation"]
minus = lambda *x: [r for r in ALL if r not in x]

# (kind, text, gold retrofit list (any order), gold unsupported terms)
GOLD = [
    ("plain", "what if I only add solar and loft insulation?", ["loft_insulation", "solar_pv"], []),
    ("plain", "add solar", ["solar_pv"], []),
    ("plain", "just the heat pump", ["heat_pump"], []),
    ("plain", "smart controls", ["smart_controls"], []),
    ("plain", "double glazing and a smart thermostat", ["double_glazing", "smart_controls"], []),
    ("plain", "what about a new condensing boiler and glazing", ["condensing_boiler", "double_glazing"], []),
    ("plain", "loft insulation only", ["loft_insulation"], []),
    ("plain", "floor insulation and cavity wall insulation", ["floor_insulation", "cavity_wall_insulation"], []),
    ("plain", "I want solar panels and a heat pump", ["solar_pv", "heat_pump"], []),
    ("plain", "only windows", ["double_glazing"], []),
    ("plain", "just roof insulation", ["loft_insulation"], []),
    ("plain", "solid wall insulation", ["solid_wall_insulation"], []),
    ("generic", "wall insulation and floor insulation", ["cavity_wall_insulation", "solid_wall_insulation", "floor_insulation"], []),
    ("generic", "only insulation", INS, []),
    ("generic", "all the insulation and a heat pump", INS + ["heat_pump"], []),
    ("generic", "new windows and wall insulation", ["double_glazing", "cavity_wall_insulation", "solid_wall_insulation"], []),
    ("generic", "something for the walls", ["cavity_wall_insulation", "solid_wall_insulation"], []),
    ("everything", "what if I do everything", ALL, []),
    ("everything", "everything except the heat pump", minus("heat_pump"), []),
    ("everything", "do all of it but skip solar", minus("solar_pv"), []),
    ("everything", "all except heat pump and solar", minus("heat_pump", "solar_pv"), []),
    ("everything", "everything without insulation", minus(*INS), []),
    ("everything", "all of it without the solar panels", minus("solar_pv"), []),
    ("everything", "everything apart from windows", minus("double_glazing"), []),
    ("everything", "the full package but not the heat pump", minus("heat_pump"), []),
    ("everything", "every measure except smart controls", minus("smart_controls"), []),
    ("negation", "without solar", ["loft_insulation", "double_glazing"], []),
    ("negation", "heat pump but skip solar", ["heat_pump"], []),
    ("negation", "no double glazing", ["loft_insulation"], []),
    ("negation", "skip the loft", ["double_glazing"], []),
    ("negation", "I don't want a heat pump", ["loft_insulation", "double_glazing"], []),
    ("negation", "heat pump and solar but no glazing", ["heat_pump", "solar_pv"], []),
    ("negation", "add solar but not the heat pump", ["solar_pv"], []),
    ("negation", "without the thermostat", ["loft_insulation", "double_glazing"], []),
    ("colloquial", "panels on the roof", ["solar_pv"], []),
    ("colloquial", "an air source heat pump", ["heat_pump"], []),
    ("colloquial", "get rid of the gas boiler and put in a heat pump", ["heat_pump"], []),
    ("colloquial", "thicker loft insulation", ["loft_insulation"], []),
    ("colloquial", "replace the old windows", ["double_glazing"], []),
    ("colloquial", "a smarter heating thermostat", ["smart_controls"], []),
    ("colloquial", "insulate the cavity walls", ["cavity_wall_insulation"], []),
    ("colloquial", "upgrade my boiler", ["condensing_boiler"], []),
    ("colloquial", "put PV on the roof and insulate the loft", ["solar_pv", "loft_insulation"], []),
    ("colloquial", "stop the heat escaping through the floor", ["floor_insulation"], []),
    ("colloquial", "cut my bills with better glazing", ["double_glazing"], []),
    ("unsupported", "solar panels with a battery", ["solar_pv"], ["battery"]),
    ("unsupported", "add draught proofing", D, ["draught"]),
    ("unsupported", "triple glazing please", ["double_glazing"], ["triple glazing"]),
    ("unsupported", "LED lighting and loft insulation", ["loft_insulation"], ["lighting"]),
    ("unsupported", "a wind turbine", D, ["wind turbine"]),
    ("unsupported", "ground source heat pump", ["heat_pump"], ["ground source"]),
    ("unclear", "make my house better", D, []),
    ("unclear", "what is best for me?", D, []),
    ("unclear", "blah", D, []),
    ("unclear", "can you explain my score", D, []),
    ("unclear", "how much will it cost", D, []),
]

# TUNING SET 2: the first held-out set. Its four failures prompted the second round of rule changes, so it is no longer held out.
HELD_OUT = [
    ("tuned-2", "can you check heat pump plus solar plus loft", ["heat_pump", "solar_pv", "loft_insulation"], []),
    ("tuned-2", "I'd rather avoid the heat pump, do everything else", minus("heat_pump"), []),
    ("tuned-2", "no solar please, just insulation", INS, []),
    ("tuned-2", "everything but the thermostat", minus("smart_controls"), []),
    ("tuned-2", "upgrade windows and loft", ["double_glazing", "loft_insulation"], []),
    ("tuned-2", "what happens if I insulate the floor and the walls", ["floor_insulation", "cavity_wall_insulation", "solid_wall_insulation"], []),
    ("tuned-2", "everything, leave out the heat pump", minus("heat_pump"), []),
    ("tuned-2", "a boiler replacement and a thermostat", ["condensing_boiler", "smart_controls"], []),
    ("tuned-2", "go big on solar", ["solar_pv"], []),
    ("tuned-2", "double glazed windows and an ASHP", ["double_glazing", "heat_pump"], []),
    ("tuned-2", "add triple glazing and a battery", ["double_glazing"], ["triple glazing", "battery"]),
    ("tuned-2", "heat pump instead of the boiler", ["heat_pump"], []),
    ("tuned-2", "I only care about carbon so everything except solar", minus("solar_pv"), []),
    ("tuned-2", "put a thermostat in", ["smart_controls"], []),
    ("tuned-2", "tell me a joke", D, []),
]


# HELD-OUT 2: written BEFORE the second round of rule changes was run and never used to change a rule. This is the number to quote for the rule parser.
HELD_OUT_2 = [
    ("held-out-2", "put in solar and a heat pump but not new windows", ["solar_pv", "heat_pump"], []),
    ("held-out-2", "all measures except the floor", minus("floor_insulation"), []),
    ("held-out-2", "I'm only interested in loft and glazing", ["loft_insulation", "double_glazing"], []),
    ("held-out-2", "skip everything except solar", ["solar_pv"], []),
    ("held-out-2", "a heat pump would be great, no thanks to solar", ["heat_pump"], []),
    ("held-out-2", "can we see what new windows and insulating the roof does", ["double_glazing", "loft_insulation"], []),
    ("held-out-2", "just a thermostat upgrade", ["smart_controls"], []),
    ("held-out-2", "everything apart from the boiler", ALL, []),
    ("held-out-2", "I'd like loft insulation, but without the floor", ["loft_insulation"], []),
    ("held-out-2", "add panels, and leave the heat pump out", ["solar_pv"], []),
    ("held-out-2", "only the cheapest things", D, []),
    ("held-out-2", "heat pump plus smart thermostat plus glazing, no solar", ["heat_pump", "smart_controls", "double_glazing"], []),
    ("held-out-2", "everything but heat pump and solar", minus("heat_pump", "solar_pv"), []),
    ("held-out-2", "what happens if I do nothing", D, []),
    ("held-out-2", "wall and loft insulation with new double glazing", ["cavity_wall_insulation", "solid_wall_insulation", "loft_insulation", "double_glazing"], []),
]


def score(parser, cases=None):
    rows = []
    for kind, text, gold, gold_uns in (cases or GOLD):
        r = parser(text); got = set(r["retrofits"]); uns = " ".join(r.get("unsupported", [])).lower()
        rows.append({"kind": kind, "text": text, "ok": got == set(gold), "got": sorted(got), "gold": sorted(gold),
                     "uns_ok": all(any(w in uns for w in g.split()) for g in gold_uns) if gold_uns else True, "has_uns": bool(gold_uns)})
    by = {}
    for r in rows: by.setdefault(r["kind"], []).append(r)
    return {"n": len(rows), "exact_match": sum(r["ok"] for r in rows) / len(rows),
            "by_kind": {k: {"n": len(v), "exact_match": sum(r["ok"] for r in v) / len(v)} for k, v in by.items()},
            "unsupported_recall": (sum(r["uns_ok"] for r in rows if r["has_uns"]) / sum(1 for r in rows if r["has_uns"])) if any(r["has_uns"] for r in rows) else None,
            "failures": [{k: r[k] for k in ("kind", "text", "got", "gold")} for r in rows if not r["ok"]]}


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--llm", action="store_true"); a = ap.parse_args()
    rules = lambda t: llm.parse_scenario(t, D, use_llm=False)
    out = {"rules_tuned_set": score(rules), "rules_tuned_set_2": score(rules, HELD_OUT), "rules_held_out_2": score(rules, HELD_OUT_2)}
    if a.llm:
        out["llm"] = score(lambda t: llm.parse_scenario(t, D, use_llm=True), HELD_OUT_2)
        out["llm"]["note"] = "an answer counts as the LLM's only when validated JSON came back; otherwise the rules answered"
    C.REPORTS.mkdir(exist_ok=True); (C.REPORTS / "whatif_eval.json").write_text(json.dumps(out, indent=1))
    for k, v in out.items():
        print(f"{k}: exact match {v['exact_match']:.2f} on {v['n']} | unsupported recall {'n/a' if v['unsupported_recall'] is None else format(v['unsupported_recall'], '.2f')} |", {x: round(y['exact_match'], 2) for x, y in v["by_kind"].items()})
        for f in v["failures"][:25]: print("   FAIL", f)


if __name__ == "__main__":
    sys.exit(main())

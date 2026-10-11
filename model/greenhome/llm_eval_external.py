"""Evaluate explanations generated outside Python (the web app's AI SDK pipeline) with exactly the metrics of llm_eval.
    python -m greenhome.llm_eval_external export scenarios.json [--n 100]   scenarios: kind, question, facts, slots, template
    python -m greenhome.llm_eval_external score generated.json              generated: the scenarios plus each `raw` LLM output
Scenarios are llm_eval's held-out set plus homes entered the app's way (estimated rating, bill totals, outside England and Wales).
Writes reports/llm_eval_web.json. Targets (brief): groundedness >= 0.90, factual accuracy >= 0.90, unsupported claims < 0.05."""
import argparse, json
from . import config as C, llm
from .engine import GreenEngine
from .llm_eval import build_scenarios, score_texts
from .service import AppEngine

APP_HOMES = [
    ({"epcBand": "unknown", "sapScore": None}, {}, "Why is my score what it is?"),
    ({}, {"region": "S99999999", "country": "S92000003", "lat": 55.95}, "What should I do first?"),
    ({"usage": {"annual": {"elecKwh": 3900, "gasKwh": 16500}}, "epcBand": "D", "sapScore": None}, {}, "What if I add solar?"),
]
BASE = dict(propertyType="house", builtForm="semi", storeys=2, ageBand="1950_1966", floorAreaM2=85, rooms=5, wallType="cavity", wallInsulation="none",
            roofType="gable", loftInsulation="thin", floorType="solid", floorInsulation="none", glazing="single", heating="gas_boiler", boilerAge="before_2005",
            controls="thermostat_trvs", solarPv="no", epcBand="E", sapScore=47,
            usage={"months": [{"month": f"{2025 + (m < 10)}-{m:02d}", "elecKwh": 340, "gasKwh": g} for m, g in
                              zip([10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1050, 1700, 2150, 2300, 1950, 1500, 950, 600, 420, 400, 430, 750])]})
PLACE = {"postcode": "M14 6HT", "lat": 53.45, "lon": -2.22, "region": "E12000002", "country": "E92000001", "district": "Manchester"}


def export(path, n):
    eng = GreenEngine(); out = []
    for kind, a, q in build_scenarios(eng, n):
        f = llm.facts(a); out.append({"kind": kind, "question": q, "facts": f, "slots": llm.slot_table(f), "template": llm.template_explanation(f, q)})
    app = AppEngine()
    for i, (rec, place, q) in enumerate(APP_HOMES * 4):
        r = app.twin({**BASE, **rec}, {**PLACE, **place}, None if i % 2 == 0 else ["heat_pump", "solar_pv"])["llm"]
        out.append({"kind": "app-entered home", "question": q, "facts": r["facts"], "slots": r["slots"], "template": r["template"]})
    json.dump(out, open(path, "w"), default=float); print(len(out), "scenarios ->", path)


def score(path):
    items = json.load(open(path))
    raw = [(x["raw"], x["facts"]) for x in items if x.get("raw")]
    shown, rejected = [], 0
    for text, f in raw:
        rendered, problems = llm.render_slots(text, f); ok = not problems and llm.check_text(rendered, f)["ok"]
        rejected += not ok; shown.append((rendered if ok else llm.template_explanation(f), f))
    R = {"n_scenarios": len(items), "n_generated": len(raw), "template": score_texts([(x["template"], x["facts"]) for x in items])}
    if raw:
        R["llm_raw_output"] = score_texts(raw, slot_mode=True); R["llm_shown_to_user"] = score_texts(shown); R["llm_rejection_rate"] = rejected / len(raw)
    t = R.get("llm_raw_output", R["template"])
    R["ps_targets"] = {"evaluated_on": "llm_raw_output" if raw else "template (no LLM output supplied)",
                       "groundedness>=0.90": t["groundedness"] >= .9, "factual_accuracy>=0.90": t["factual_accuracy"] >= .9, "unsupported<0.05": t["unsupported_claim_rate"] < .05}
    C.REPORTS.mkdir(exist_ok=True); json.dump(R, open(C.REPORTS / "llm_eval_web.json", "w"), indent=1, default=float)
    print(json.dumps(R, indent=1, default=float))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("cmd", choices=["export", "score"]); ap.add_argument("path"); ap.add_argument("--n", type=int, default=100)
    a = ap.parse_args()
    export(a.path, a.n) if a.cmd == "export" else score(a.path)

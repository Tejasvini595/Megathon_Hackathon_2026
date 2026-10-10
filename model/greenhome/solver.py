"""'What gets me to the next band?': exhaustive search over feasible retrofit combinations for the cheapest packages that lift the Green Home Score
to a target (default: the next band up). Everything is computed by the same engine and score as the rest of the product, so the LLM only explains it.

Search: with at most 9 feasible measures there are at most 511 non-empty combinations, so we simply evaluate all of them (no heuristic, no approximation).
A package never combines a heat pump with a boiler upgrade. Costs are the catalogue's indicative ranges (median of real EPC indicative costs) and bills use
indicative tariffs, so payback is an estimate. If no combination reaches the target the result says so and reports the best score that is reachable."""
import itertools
import numpy as np
import pandas as pd
from . import config as C
from .retrofits import feasibility, analyse_scenario
from .scoring import green_score


def next_band(score: float):
    """(threshold, name) of the next class above `score`, or None if already at the top."""
    for thr, name in sorted(C.CLASSES):
        if thr > round(score): return thr, name
    return None


def _score_after(p: dict, scen: dict, src: str, intensity_now: float) -> dict:
    inten = (intensity_now - scen["saving"]["total"] / p["floor_area"]) if src == "metered" and not pd.isna(intensity_now) else np.nan
    return green_score(dict(p, **scen["new_state"], sap_score=scen["sap_after"], energy_rating=scen["rating_after"], intensity=inten))


def _option(p, scen, sc):
    cost = scen["cost_gbp"]; bill = scen["bill_saving_gbp"]
    return {"retrofits": scen["selected"], "labels": [C.LABEL[r] for r in scen["selected"]], "cost_low": scen["cost_low"], "cost_high": scen["cost_high"], "cost_mid": cost,
            "score_after": sc["score"], "class_after": sc["classification"], "rating_after": scen["rating_after"], "sap_after": scen["sap_after"],
            "d_elec": scen["saving"]["elec"], "d_gas": scen["saving"]["gas"], "carbon_kg": scen["carbon_saving_kg"], "bill_saving_gbp": bill,
            "payback_years": round(cost / bill, 1) if bill > 1 else None, "improvement_pct": scen["improvement_potential_pct"],
            "electricity_rises": scen["saving"]["elec"] < 0}


def plan(eng, p: dict, target_score: float = None, exclude=(), budget_gbp: float = None, top: int = 3) -> dict:
    """eng: GreenEngine (for the baseline usage). exclude: measure ids the customer cannot or will not do. budget_gbp: cap on the mid-point package cost."""
    if p["fuel_scope"] != "gas_elec":
        return {"available": False, "reason": "Heating outside grid-electricity + gas accounting (community heat / other fuel): savings are not estimated."}
    elec, gas, src = eng.baseline(p)
    inten0 = p["intensity"] if src == "metered" else np.nan
    sc0 = green_score(dict(p, intensity=inten0))
    tgt = target_score if target_score is not None else (next_band(sc0["score"]) or (None, None))[0]
    out = {"available": True, "current": {"score": sc0["score"], "class": sc0["classification"]}, "usage_source": src}
    if tgt is None:
        return {**out, "target": None, "reachable": True, "options": [], "frontier": [], "note": "Already in the top band."}
    tname = next((n for t, n in C.CLASSES if t == tgt), f"score {tgt}")
    feas = feasibility(p); excl = set(exclude)
    cand = [r for r in C.ORDER if feas[r][0] and r not in excl]
    skipped = {r: (feas[r][1] if not feas[r][0] else "excluded by the customer's constraints or choices") for r in C.ORDER if r not in cand}
    evald = []
    for k in range(1, len(cand) + 1):
        for sub in itertools.combinations(cand, k):
            if "heat_pump" in sub and "condensing_boiler" in sub: continue
            scen = analyse_scenario(p, elec, gas, list(sub)); evald.append((frozenset(scen["selected"]), _option(p, scen, _score_after(p, scen, src, inten0))))
    opts = [o for _, o in evald if budget_gbp is None or o["cost_mid"] <= budget_gbp]
    best = max(opts, key=lambda o: o["score_after"]) if opts else None
    qual = sorted([(s, o) for s, o in evald if o["score_after"] >= tgt and (budget_gbp is None or o["cost_mid"] <= budget_gbp)], key=lambda t: (t[1]["cost_mid"], -t[1]["carbon_kg"]))
    minimal = [(s, o) for s, o in qual if not any(s2 < s for s2, _ in qual)]            # no cheaper subset already reaches the target
    options = [o for _, o in minimal[:top]]
    frontier, best_sc = [], -1
    for o in sorted(opts, key=lambda o: o["cost_mid"]):
        if o["score_after"] > best_sc: frontier.append(o); best_sc = o["score_after"]
    note = ("" if options else
            (f"No combination of the measures available to you reaches {tname} ({tgt}+). " + (f"The best reachable score is {best['score_after']} ({best['class_after']}) with {', '.join(best['labels'])}." if best else "No measure is available.")))
    return {**out, "target": {"score": tgt, "class": tname}, "reachable": bool(options), "options": options, "frontier": frontier, "n_evaluated": len(evald),
            "best_reachable": best, "unavailable_measures": skipped, "budget_gbp": budget_gbp, "note": note,
            "label": "Estimates, not guarantees. Costs are catalogue ranges; bills use indicative tariffs."}

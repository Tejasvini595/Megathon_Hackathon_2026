"""'Break it' mode: inject faults into a real home and check that the system flags, abstains or explains instead of guessing.
    python -m greenhome.breakit            # runs the automated suite and writes reports/breakit.json

Two parts:
 * conflict_flags(p): rule-based consistency checks on one home record (also used by the engine, so users see the same flags). Thresholds come from the data:
   in the training homes 99% have metered intensity between 0.35x and 1.5x of the EPC-implied intensity, so a ratio above 2.0 or below 0.30 is flagged.
 * run_suite(eng): ten fault types, each with an explicit expectation; the pass rate is a robustness result for the report, not a model metric."""
import json
import numpy as np
import pandas as pd
from . import config as C

RATIO_HIGH, RATIO_LOW = 2.0, 0.30


def _num(x):
    try: return float(x)
    except (TypeError, ValueError): return float("nan")


def conflict_flags(p: dict) -> list:
    """Consistency checks on one home. Returns [{code, message}]. A flag never changes a number; it tells the user to check the input."""
    f = []; area = _num(p.get("floor_area")); rooms = _num(p.get("habitable_rooms")); inten = _num(p.get("intensity")); epc = _num(p.get("epc_primary_kwh_m2"))
    if area == area and (area < C.FAULT_FLOOR_AREA[0] or area > C.FAULT_FLOOR_AREA[1]):
        f.append({"code": "implausible_floor_area", "message": f"Floor area {area:.0f} m2 is outside the plausible range ({C.FAULT_FLOOR_AREA[0]} to {C.FAULT_FLOOR_AREA[1]} m2): per-m2 figures are unreliable."})
    if area == area and rooms == rooms and rooms > 0 and not (6 <= area / rooms <= 60):
        f.append({"code": "implausible_rooms", "message": f"{rooms:.0f} habitable rooms in {area:.0f} m2 looks wrong: check the room count or the floor area."})
    if inten == inten and epc == epc and epc > 0:
        r = inten / epc
        if r > RATIO_HIGH: f.append({"code": "use_far_above_rating", "message": f"Metered use per m2 is {r:.1f}x what the EPC rating implies (nearly all homes are within 0.35x to 1.5x): the rating may be out of date, the home used differently, or the data is wrong."})
        elif r < RATIO_LOW: f.append({"code": "use_far_below_rating", "message": f"Metered use per m2 is only {r:.2f}x what the EPC rating implies (nearly all homes are within 0.35x to 1.5x): the home may be partly empty, or the data is wrong."})
    gas = _num(p.get("gas_annual")); hd = str(p.get("heating_detail"))
    if gas == gas and gas > 500 and p.get("mains_gas_flag") is False:
        f.append({"code": "gas_use_without_gas_supply", "message": "Gas use is recorded but the property is recorded as having no mains gas."})
    if gas == gas and gas > 3000 and hd.startswith(("electric", "heat_pump")):
        f.append({"code": "gas_use_with_electric_heating", "message": "Large gas use but the main heating is recorded as electric or a heat pump: check the heating type."})
    return f


def _base(eng):
    d = eng.df
    r = d[(d.fuel_scope == "gas_elec") & (d.property_type == "House") & (d.heating_detail == "gas_boiler") & (d.usage_status == "metered") & (d.split == "test")]
    return eng.prop(r.index[10])


def _recompute_intensity(p):
    e, g = _num(p.get("elec_annual")), _num(p.get("gas_annual"))
    p["intensity"] = (e + g) / p["floor_area"] if e == e and g == g and p["floor_area"] >= C.FAULT_FLOOR_AREA[0] else float("nan")
    return p


def make_fault(p: dict, kind: str) -> dict:
    """Return a copy of home `p` with one fault injected."""
    q = dict(p); nan = float("nan")
    if kind == "missing_usage": q.update(elec_annual=nan, gas_annual=nan, intensity=nan, usage_status="unavailable", elec_months=nan, gas_months=nan)
    elif kind == "short_history": q.update(elec_annual=nan, gas_annual=nan, intensity=nan, usage_status="unavailable", elec_months=3, gas_months=3)
    elif kind == "rating_A_but_huge_use": q.update(sap_score=94.0, energy_rating="A", elec_annual=p["elec_annual"] * 4, gas_annual=p["gas_annual"] * 4); _recompute_intensity(q)
    elif kind == "rating_F_but_tiny_use": q.update(sap_score=25.0, energy_rating="F", elec_annual=p["elec_annual"] * 0.15, gas_annual=p["gas_annual"] * 0.1); _recompute_intensity(q)
    elif kind == "gas_use_no_gas_supply": q.update(mains_gas_flag=False)
    elif kind == "impossible_floor_area": q.update(floor_area=3.0); _recompute_intensity(q)
    elif kind == "community_heating": q.update(fuel_scope="heat_network", heating_detail="community")
    elif kind == "flat_asks_heat_pump": q.update(property_type="Flat", roof_type="dwelling_above")
    elif kind == "no_value_estimate": q.update(current_value_estimate=nan)
    elif kind == "zero_baseline": q.update(elec_annual=0.0, gas_annual=0.0, intensity=0.0)
    else: raise ValueError(kind)
    return q


KINDS = {
    "missing_usage": "no meter readings at all",
    "short_history": "only 3 months of readings",
    "rating_A_but_huge_use": "EPC says A but metered use is 4x typical",
    "rating_F_but_tiny_use": "EPC says F but metered use is tiny",
    "gas_use_no_gas_supply": "gas use recorded, but no mains gas",
    "impossible_floor_area": "floor area of 3 m2",
    "community_heating": "heating outside grid + gas accounting",
    "flat_asks_heat_pump": "a flat asks for a heat pump",
    "no_value_estimate": "no current value estimate",
    "zero_baseline": "zero baseline energy",
}


def respond(eng, p: dict, kind: str) -> dict:
    """Run the pipeline on the faulty home and describe what the system did, plus whether that is the expected safe behaviour."""
    q = make_fault(p, kind); asked = ["heat_pump"] if kind == "flat_asks_heat_pump" else None
    a = eng.analyse_property(q, asked); dq = a["data_quality"]; sc = a["scenario"]; res = sc.get("result")
    flags = conflict_flags(q); obs = {"usage_source": dq["usage_source"], "score_partial": dq["score_partial"], "savings_available": dq["savings_available"],
                                     "conflict_codes": [x["code"] for x in flags], "infeasible_requested": [x["retrofit"] for x in sc.get("infeasible_requested", [])],
                                     "value_available": bool(sc.get("value")), "improvement_pct": None if not res else res["improvement_potential_pct"],
                                     "retrofits_in_result": sc.get("retrofits", [])}
    ok = {"missing_usage": obs["usage_source"] == "modelled" and obs["score_partial"],
          "short_history": obs["usage_source"] == "modelled" and obs["score_partial"],
          "rating_A_but_huge_use": "use_far_above_rating" in obs["conflict_codes"],
          "rating_F_but_tiny_use": "use_far_below_rating" in obs["conflict_codes"],
          "gas_use_no_gas_supply": "gas_use_without_gas_supply" in obs["conflict_codes"],
          "impossible_floor_area": "implausible_floor_area" in obs["conflict_codes"] and obs["score_partial"],
          "community_heating": not obs["savings_available"] and res is None,
          "flat_asks_heat_pump": "heat_pump" in obs["infeasible_requested"] and "heat_pump" not in obs["retrofits_in_result"],
          "no_value_estimate": res is not None and not obs["value_available"],
          "zero_baseline": res is not None and obs["improvement_pct"] is None}[kind]
    return {"kind": kind, "description": KINDS[kind], "observed": obs, "flags": flags, "passed": bool(ok), "score_now": a["score"]["score"], "class_now": a["score"]["classification"]}


def run_suite(eng, n_homes: int = 5) -> dict:
    d = eng.df; pool = d[(d.fuel_scope == "gas_elec") & (d.property_type == "House") & (d.heating_detail == "gas_boiler") & (d.usage_status == "metered") & (d.split.isin(["test", "geo_test"]))]
    ids = list(pool.index[:: max(1, len(pool) // n_homes)][:n_homes]); rows = []
    for pid in ids:
        p = eng.prop(pid)
        for k in KINDS: r = respond(eng, p, k); r["property_id"] = pid; rows.append(r)
    by = {}
    for r in rows: by.setdefault(r["kind"], []).append(r["passed"])
    return {"n_homes": len(ids), "n_cases": len(rows), "pass_rate": float(np.mean([r["passed"] for r in rows])), "by_kind": {k: float(np.mean(v)) for k, v in by.items()},
            "failures": [{k: r[k] for k in ("property_id", "kind", "observed")} for r in rows if not r["passed"]],
            "clean_homes_flag_rate": float(np.mean([bool(conflict_flags(eng.prop(i))) for i in pool.index[:2000]]))}


def main():
    from .engine import GreenEngine
    out = run_suite(GreenEngine()); C.REPORTS.mkdir(exist_ok=True); (C.REPORTS / "breakit.json").write_text(json.dumps(out, indent=1, default=float))
    print(f"Break-it: {out['pass_rate']*100:.0f}% of {out['n_cases']} fault cases handled as expected | clean homes wrongly flagged: {out['clean_homes_flag_rate']*100:.1f}%")
    for k, v in out["by_kind"].items(): print(f"  {k:26s} {v*100:.0f}%")
    for f in out["failures"][:10]: print("   FAIL", f["property_id"], f["kind"], f["observed"])


if __name__ == "__main__":
    main()

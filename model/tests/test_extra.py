"""Checks added after review: unknown is not 'already fine', energy totals reconcile, provisional score bounds, solver, memory, Break-it.
Run:  python -m pytest -q tests"""
import sys, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
import numpy as np
import pandas as pd
from greenhome import config as C, custom, solver, memory, breakit
from greenhome.features import build_master
from greenhome.scoring import green_score
from greenhome.retrofits import analyse_scenario, feasibility, needs_info, recommend
from greenhome.engine import GreenEngine

DF = build_master(); MET = DF[(DF.usage_status == "metered") & (DF.fuel_scope == "gas_elec")]
_ENG = None


def eng():
    global _ENG
    if _ENG is None: _ENG = GreenEngine()
    return _ENG


BASE = dict(property_type="House", built_form="Semi-Detached", floor_area=80.0, age_band="1930-1949", habitable_rooms=5, energy_rating="D",
            heating="Gas boiler (condensing / modern)", wall_type="Cavity", wall_ins="No insulation", loft="unknown",
            glazing="Fully double glazing", controls="Programmer + room thermostat / TRVs", solar_kwp=None, climate="Midlands")


def test_unknown_loft_and_floor_are_not_reported_as_fine():
    p = custom.build_property(BASE, DF); f = feasibility(p)
    assert not f["loft_insulation"][0] and f["loft_insulation"][1].startswith("Status unknown")
    assert "already adequately" not in f["loft_insulation"][1] and "No uninsulated" not in f["floor_insulation"][1]
    assert f["floor_insulation"][1].startswith("Status unknown")
    assert "loft_insulation" in needs_info(p) and "floor_insulation" in needs_info(p)
    a = eng().analyse_property(p, ["loft_insulation", "floor_insulation"])
    assert a["scenario"]["infeasible_requested"] and all(x["needs_info"] for x in a["scenario"]["infeasible_requested"])


def test_known_values_are_unchanged_by_the_unknown_rule():
    p = custom.build_property(dict(BASE, loft=50), DF); assert feasibility(p)["loft_insulation"][0]
    p = custom.build_property(dict(BASE, loft=300), DF); f = feasibility(p)["loft_insulation"]; assert not f[0] and not f[1].startswith("Status unknown")


def test_energy_totals_reconcile_and_never_negative():
    for p in MET.sample(300, random_state=3).to_dict("records"):
        e, g = p["elec_annual"], p["gas_annual"]; r = recommend(p, e, g)["package"]
        assert r["after"]["elec"] >= -1e-6 and r["after"]["gas"] >= -1e-6, p["property_id"]
        assert abs(r["baseline"]["elec"] - r["after"]["elec"] - r["saving"]["elec"]) < 1e-6 and abs(r["baseline"]["gas"] - r["after"]["gas"] - r["saving"]["gas"]) < 1e-6
        assert abs(sum(x["d_elec"] for x in r["per_retrofit"]) - r["saving"]["elec"]) < 1e-6 and abs(sum(x["d_gas"] for x in r["per_retrofit"]) - r["saving"]["gas"]) < 1e-6
        assert abs(r["carbon_saving_kg"] - (r["saving"]["elec"] * C.EMISSION_FACTORS["elec"] + r["saving"]["gas"] * C.EMISSION_FACTORS["gas"])) < 1e-6


def test_provisional_score_bounds():
    p = MET[MET.has_solar_pv.isna()].iloc[0].to_dict(); r = green_score(dict(p, intensity=np.nan))
    assert r["partial"] and r["n_known"] < 7 and r["bounds"]["low"] <= r["score"] <= r["bounds"]["high"] and r["bounds"]["low"] < r["bounds"]["high"]
    q = MET[MET.has_solar_pv.notna() & MET.intensity.notna()].iloc[0].to_dict(); r2 = green_score(q)
    assert not r2["partial"] and r2["n_known"] == 7 and abs(r2["bounds"]["low"] - r2["score"]) <= 1 and abs(r2["bounds"]["high"] - r2["score"]) <= 1


def _poor_house():
    d = eng().df
    return eng().prop(d[(d.fuel_scope == "gas_elec") & (d.property_type == "House") & (d.sap_score < 45) & (d.usage_status == "metered") & (d.loft_mm < 100) & (d.glazing_level <= 1)].index[7])


def test_solver_reaches_target_is_minimal_and_respects_constraints():
    p = _poor_house(); r = solver.plan(eng(), p)
    assert r["available"] and r["target"]["score"] > r["current"]["score"]
    assert r["reachable"] and all(o["score_after"] >= r["target"]["score"] for o in r["options"])
    costs = [o["cost_mid"] for o in r["options"]]; assert costs == sorted(costs)
    for o in r["options"]:
        assert not ("heat_pump" in o["retrofits"] and "condensing_boiler" in o["retrofits"])
    ex = solver.plan(eng(), p, exclude={r["options"][0]["retrofits"][0]}); assert all(r["options"][0]["retrofits"][0] not in o["retrofits"] for o in ex["options"])
    cheap = solver.plan(eng(), p, budget_gbp=1.0); assert not cheap["options"] and cheap["note"]


def test_solver_unavailable_for_non_grid_gas_homes():
    d = eng().df; pid = d[d.fuel_scope != "gas_elec"].index[0]; assert not solver.plan(eng(), eng().prop(pid))["available"]


def test_memory_changes_the_plan_and_applies_completed_work():
    p = _poor_house(); steps = memory.journey(eng(), p, ["I installed loft insulation last year and double glazing", "I don't want a heat pump, too disruptive."])
    assert steps[1]["current"]["score"] > steps[0]["current"]["score"]                 # completed work raises the baseline score
    assert "loft_insulation" not in (steps[1]["best_package"] or []) and "double_glazing" not in (steps[1]["best_package"] or [])
    assert "heat_pump" in steps[2]["excluded_by_memory"] and "heat_pump" not in (steps[2]["best_package"] or [])
    r = memory.journey(eng(), p, ["I rent this home"])[1]; assert r["best_package"] in (None, ["smart_controls"])      # tenants: only controls


def test_memory_parser():
    e = memory.parse_note("I rent. Budget up to 5,000 pounds, carbon matters most. I don't want a heat pump, too disruptive. I installed loft insulation.")
    assert e["renting"] and e["budget_gbp"] == 5000 and e["priority"] == "carbon" and e["declined"].get("heat_pump") == "too disruptive" and "loft_insulation" in e["completed"]


def test_conflict_flags():
    p = _poor_house()
    assert breakit.conflict_flags(dict(p, floor_area=3.0))
    assert breakit.conflict_flags(dict(p, intensity=p["epc_primary_kwh_m2"] * 4))[0]["code"] == "use_far_above_rating"
    assert breakit.conflict_flags(dict(p, intensity=p["epc_primary_kwh_m2"] * 0.1))[0]["code"] == "use_far_below_rating"


def test_breakit_suite_passes_and_rarely_flags_clean_homes():
    r = breakit.run_suite(eng(), n_homes=2); assert r["pass_rate"] == 1.0 and r["clean_homes_flag_rate"] < 0.05


def test_needs_information_surfaced_by_engine():
    a = eng().analyse_property(custom.build_property(BASE, DF)); assert {x["retrofit"] for x in a["needs_information"]} >= {"loft_insulation", "floor_insulation"}
    assert a["data_quality"]["elec_months"] is None


def test_memory_records_work_done_on_unknown_starting_condition():
    p = custom.build_property(BASE, DF); mem = memory.empty(); memory.remember(mem, "I installed loft insulation last year")
    p2, excl, budget, notes = memory.personalise(eng(), p, mem)
    assert any("Recorded as done" in n for n in notes) and p2["loft_mm"] == 270.0 and excl["loft_insulation"] == "already done"
    assert "loft_insulation" not in needs_info(p2)

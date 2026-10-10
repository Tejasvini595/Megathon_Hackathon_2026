"""Property-based (Hypothesis) and scenario tests for the PS rules.   python -m pytest -q tests"""
import sys, pathlib, copy
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
import numpy as np
import pandas as pd
from hypothesis import given, settings, HealthCheck, strategies as st
from greenhome import config as C, llm
from greenhome.features import build_master
from greenhome.scoring import score_df, sub_scores, green_score
from greenhome.retrofits import recommend, analyse_scenario, feasibility, monte_carlo, carbon_saving

DF = build_master(); GAS = DF[(DF.usage_status == "metered") & (DF.fuel_scope == "gas_elec")].reset_index(drop=True)
HOMES = GAS.sample(400, random_state=3).to_dict("records")
FAST = settings(max_examples=60, deadline=None, suppress_health_check=[HealthCheck.too_slow, HealthCheck.data_too_large])
home = st.sampled_from(HOMES)
measures = st.lists(st.sampled_from(C.ORDER), unique=True, max_size=9)


# ----------------------------------------------------------------- score
@FAST
@given(home, st.floats(0, 40), st.integers(0, 3), st.integers(0, 5), st.floats(0, 200), st.floats(0.1, 1.0))
def test_better_state_never_lowers_a_subscore(h, dsap, dctrl, dglaz, dloft, k):
    base = pd.DataFrame([h]); better = base.copy()
    better["sap_score"] = np.minimum(base.sap_score + dsap, 100); better["controls_level"] = np.minimum(base.controls_level + dctrl, 3)
    better["glazing_level"] = np.minimum(base.glazing_level + dglaz, 5); better["loft_mm"] = base.loft_mm + dloft; better["intensity"] = base.intensity * k
    a, b = sub_scores(base).iloc[0], sub_scores(better).iloc[0]
    for c in a.index:
        if pd.notna(a[c]) and pd.notna(b[c]): assert b[c] >= a[c] - 1e-9, c


@FAST
@given(home)
def test_score_is_integer_in_range_and_components_add_up(h):
    r = green_score(h); assert isinstance(r["score"], int) and 0 <= r["score"] <= 100
    assert abs(sum(c["contribution"] for c in r["components"].values() if c["contribution"] is not None) - r["score"]) <= 0.51


# ----------------------------------------------------------------- retrofit engine
@FAST
@given(home, measures)
def test_marginal_savings_sum_to_package_and_inputs_are_not_mutated(h, sel):
    before = copy.deepcopy(h); a = analyse_scenario(h, h["elec_annual"], h["gas_annual"], sel)
    assert h == before or all((h[k] == before[k]) or (pd.isna(h[k]) and pd.isna(before[k])) for k in h)
    assert abs(sum(x["d_elec"] for x in a["per_retrofit"]) - a["saving"]["elec"]) < 1e-6
    assert abs(sum(x["d_gas"] for x in a["per_retrofit"]) - a["saving"]["gas"]) < 1e-6
    assert a["after"]["elec"] >= -1e-6 and a["after"]["gas"] >= -1e-6


@FAST
@given(home, measures)
def test_carbon_is_the_per_fuel_formula_and_sap_never_falls(h, sel):
    a = analyse_scenario(h, h["elec_annual"], h["gas_annual"], sel)
    assert abs(a["carbon_saving_kg"] - (a["saving"]["elec"] * C.EMISSION_FACTORS["elec"] + a["saving"]["gas"] * C.EMISSION_FACTORS["gas"])) < 1e-6
    assert h["sap_score"] - 1e-9 <= a["sap_after"] <= 100


@FAST
@given(home, measures)
def test_infeasible_measures_are_never_applied(h, sel):
    feas = feasibility(h); a = analyse_scenario(h, h["elec_annual"], h["gas_annual"], sel)
    assert all(feas[r][0] for r in a["selected"])


@FAST
@given(home)
def test_recommended_package_only_contains_feasible_measures_in_fabric_first_order(h):
    r = recommend(h, h["elec_annual"], h["gas_annual"]); sel = r["package"]["selected"]; feas = feasibility(h)
    assert sel == sorted(sel, key=C.ORDER.index) and all(feas[x][0] for x in sel)
    assert not ("heat_pump" in sel and "condensing_boiler" in sel)


@settings(max_examples=15, deadline=None)
@given(home)
def test_monte_carlo_band_is_ordered_and_reproducible(h):
    sel = recommend(h, h["elec_annual"], h["gas_annual"])["package"]["selected"]
    if not sel: return
    m1 = monte_carlo(h, h["elec_annual"], h["gas_annual"], sel, n=40, seed=1); m2 = monte_carlo(h, h["elec_annual"], h["gas_annual"], sel, n=40, seed=1)
    assert m1 == m2
    for k in ("elec", "gas", "total", "improvement_pct", "carbon_kg"): lo, mid, hi = m1["package"][k]; assert lo <= mid + 1e-9 <= hi + 2e-9


# ----------------------------------------------------------------- what-if parser
@FAST
@given(st.lists(st.sampled_from(["loft_insulation", "double_glazing", "smart_controls", "heat_pump", "solar_pv"]), unique=True, min_size=1, max_size=4))
def test_everything_except_removes_exactly_the_named_measures(drop):
    words = {"loft_insulation": "loft insulation", "double_glazing": "double glazing", "smart_controls": "smart thermostat", "heat_pump": "heat pump", "solar_pv": "solar panels"}
    got = set(llm.parse_whatif("everything except " + " and ".join(words[d] for d in drop)))
    assert got == (set(C.ORDER) - {"condensing_boiler"}) - set(drop)


# ----------------------------------------------------------------- guardrail
@settings(max_examples=40, deadline=None)
@given(st.integers(0, 3000))
def test_typed_digits_are_always_rejected_in_slot_mode(n):
    f = llm.facts(GE.analyse(PID)); assert llm.render_slots(f"You save {n} kWh.", f)[1]


# ----------------------------------------------------------------- scenario tests named in the brief
class _E:  # lazily built engine (needs trained models)
    pass


try:
    from greenhome.engine import GreenEngine
    GE = GreenEngine(); PID = GE.search("B6")[0]
except Exception:  # models not trained yet
    GE = None


def test_missing_usage_is_modelled_flagged_and_excluded_from_the_score():
    pid = DF[(DF.usage_status == "unavailable") & (DF.fuel_scope == "gas_elec")].property_id.iloc[0]; a = GE.analyse(pid)
    assert a["data_quality"]["usage_source"] == "modelled" and a["score"]["partial"] and a["score"]["components"]["energy_intensity"]["sub_score"] is None


def test_heat_pump_raises_electricity_and_the_explanation_says_so():
    h = GAS[(GAS.property_type == "House") & (GAS.heating_detail == "gas_boiler")].iloc[0]; a = GE.analyse(h.property_id, ["heat_pump"]); f = llm.facts(a)
    assert f["package"]["electricity_saving_kwh"] < 0 < f["package"]["gas_saving_kwh"]
    assert re.search(r"rise|negative", llm.template_explanation(f), re.I)


def test_flat_requests_for_infeasible_measures_are_reported_not_quantified():
    pid = GAS[GAS.property_type == "Flat"].property_id.iloc[0]; a = GE.analyse(pid, ["heat_pump", "solar_pv"]); f = llm.facts(a)
    assert {x["retrofit"] for x in f["infeasible_requested"]} == {"heat_pump", "solar_pv"} and f["scenario_retrofits"] == []
    assert "not feasible" in llm.template_explanation(f)


def test_community_heating_gets_a_score_but_savings_are_unavailable():
    pid = DF[DF.fuel_scope == "heat_network"].property_id.iloc[0]; a = GE.analyse(pid)
    assert a["score"]["score"] >= 0 and a["scenario"]["result"] is None and "unavailable" in llm.template_explanation(llm.facts(a)).lower()


def test_conflicting_signals_still_produce_a_consistent_score():
    from greenhome import custom
    x = dict(property_type="House", built_form="Detached", floor_area=100.0, age_band="1983-1990", habitable_rooms=5, energy_rating="A", heating="Gas boiler (condensing / modern)",
             wall_type="Cavity", wall_ins="Fully insulated (filled cavity / internal / external)", loft=270, glazing="Fully double glazing", controls="Zoned or smart controls",
             solar_kwp=0, climate="Midlands", elec_kwh=9000.0, gas_kwh=45000.0, current_value=300000)
    a = GE.analyse_property(custom.build_property(x, DF)); assert 0 <= a["score"]["score"] <= 100 and a["score"]["intensity_kwh_m2"] == 540.0


def test_zero_baseline_energy_gives_unavailable_improvement():
    h = HOMES[0]; assert analyse_scenario(h, 0.0, 0.0, C.ORDER)["improvement_potential_pct"] is None


def _fake_generate(raw):
    def gen(a_, q=""):
        f_ = llm.facts(a_); text, probs = llm.render_slots(raw, f_); return {"raw": raw, "text": text, "problems": probs, "facts": f_}
    return gen


def test_llm_path_accepts_slot_text_and_rejects_typed_digits_and_overclaims(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test"); a = GE.analyse(PID)
    good = ("Your score is [[score_now]]/100. The package changes electricity by [[package.electricity_saving_kwh]] kWh and gas by [[package.gas_saving_kwh]] kWh a year. "
            "These are estimates, not guarantees.")
    monkeypatch.setattr(llm, "generate", _fake_generate(good)); r = llm.explain(a); assert r["source"].startswith("LLM") and "100" in r["text"]
    for bad in ("Your score is 51/100.", good + " This is guaranteed.", good + " A home battery would help.", "Gas falls by [[package.invented]] kWh."):
        monkeypatch.setattr(llm, "generate", _fake_generate(bad)); r = llm.explain(a); assert r["source"].startswith("template (LLM output rejected"), bad


import re  # noqa: E402  (used above)

if __name__ == "__main__":
    import pytest; raise SystemExit(pytest.main(["-q", __file__]))

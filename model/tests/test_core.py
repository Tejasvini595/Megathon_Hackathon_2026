"""Rule checks from the brief. Run:  python -m pytest -q tests   (or: python tests/test_core.py)"""
import sys, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
import numpy as np
import pandas as pd
from greenhome import config as C
from greenhome.features import build_master
from greenhome.scoring import score_df, green_score
from greenhome.retrofits import recommend, analyse_scenario, carbon_saving

DF = build_master(); MET = DF[(DF.usage_status == "metered") & (DF.fuel_scope == "gas_elec")]


def test_weights_sum_to_one():
    assert abs(sum(C.WEIGHTS.values()) - 1) < 1e-9


def test_score_in_range_and_rounded():
    s = score_df(DF.sample(5000, random_state=0)); assert s.score.between(0, 100).all() and (s.score == s.score.round()).all()


def test_components_sum_to_score():
    p = MET.iloc[0].to_dict(); r = green_score(p)
    assert abs(sum(c["contribution"] for c in r["components"].values() if c["contribution"] is not None) - r["score"]) <= 0.51


def test_subscore_monotone():
    r = DF[DF.has_solar_pv.notna()].sample(3000, random_state=1); base = score_df(r).score
    for col, f in [("sap_score", lambda x: x + 5), ("glazing_level", lambda x: np.minimum(x + 1, 5)), ("controls_level", lambda x: np.minimum(x + 1, 3)),
                   ("wall_insulation_level", lambda x: np.minimum(x + 1, 3)), ("loft_mm", lambda x: x + 50), ("intensity", lambda x: x * 0.8),
                   ("solar_kwp_est", lambda x: x.fillna(0) + 2)]:
        q = r.copy(); q[col] = f(q[col]); assert (score_df(q).score - base).min() >= 0, col


def test_missing_is_excluded_not_zero():
    p = MET.iloc[0].to_dict(); p["intensity"] = np.nan; r = green_score(p)
    assert r["partial"] and r["components"]["energy_intensity"]["sub_score"] is None


def test_carbon_matches_per_fuel_formula():
    p = MET[MET.property_type == "House"].iloc[0].to_dict(); a = analyse_scenario(p, p["elec_annual"], p["gas_annual"], C.ORDER)
    assert abs(a["carbon_saving_kg"] - (a["saving"]["elec"] * C.EMISSION_FACTORS["elec"] + a["saving"]["gas"] * C.EMISSION_FACTORS["gas"])) < 1e-6


def test_heat_pump_raises_electricity_and_is_negative_saving():
    h = MET[(MET.property_type == "House") & (MET.heating_detail == "gas_boiler")].iloc[0].to_dict()
    a = analyse_scenario(h, h["elec_annual"], h["gas_annual"], ["heat_pump"]); assert a["saving"]["elec"] < 0 < a["saving"]["gas"]


def test_package_is_not_the_sum_of_standalone_savings_and_marginals_add_up():
    h = MET[(MET.property_type == "House") & (MET.heating_detail == "gas_boiler")].iloc[3].to_dict(); rec = recommend(h, h["elec_annual"], h["gas_annual"])["package"]
    alone = sum(analyse_scenario(h, h["elec_annual"], h["gas_annual"], [x["retrofit"]])["saving"]["total"] for x in rec["per_retrofit"])
    marg = sum(x["d_elec"] + x["d_gas"] for x in rec["per_retrofit"])
    assert abs(marg - rec["saving"]["total"]) < 1e-6 and abs(alone - rec["saving"]["total"]) > 1.0


def test_infeasible_never_recommended():
    f = MET[MET.property_type == "Flat"].iloc[0].to_dict(); sel = recommend(f, f["elec_annual"], f["gas_annual"])["package"]["selected"]
    assert "heat_pump" not in sel and "solar_pv" not in sel


def test_zero_baseline_unavailable():
    p = MET.iloc[0].to_dict(); a = analyse_scenario(p, 0.0, 0.0, C.ORDER); assert a["improvement_potential_pct"] is None


def test_whatif_parser():
    from greenhome.llm import parse_whatif as P
    ALL = {"loft_insulation", "cavity_wall_insulation", "solid_wall_insulation", "floor_insulation", "double_glazing", "smart_controls", "heat_pump", "solar_pv"}
    assert set(P("what if I do everything")) == ALL
    assert set(P("everything except the heat pump")) == ALL - {"heat_pump"}
    assert set(P("do all of it but skip solar")) == ALL - {"solar_pv"}
    assert set(P("all except heat pump and solar")) == ALL - {"heat_pump", "solar_pv"}
    assert set(P("everything without insulation")) == ALL - {"loft_insulation", "cavity_wall_insulation", "solid_wall_insulation", "floor_insulation"}
    assert P("heat pump but skip solar") == ["heat_pump"]
    assert P("only solar and loft insulation") == ["loft_insulation", "solar_pv"]
    assert P("without solar", default=["loft_insulation", "solar_pv"]) == ["loft_insulation"]
    assert P("add wall insulation and double glazing") == ["cavity_wall_insulation", "solid_wall_insulation", "double_glazing"]
    assert P("blah", default=["solar_pv"]) == ["solar_pv"]


if __name__ == "__main__":
    for n, f in list(globals().items()):
        if n.startswith("test_"): f(); print("PASS", n)

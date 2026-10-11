"""Deterministic retrofit engine (9 catalogue measures): feasibility, per-fuel savings with interactions, carbon,
cost/payback, post-retrofit SAP. Never reads labels_* or hidden simulator state.

Conventions: saving = baseline - after (kWh/yr); positive = less use, negative = use rises.
Per-retrofit savings are MARGINAL along the catalogue's fabric-first order, so they sum to the package saving:
interactions (insulation shrinking the heat-pump load, a heat pump raising electricity that solar then offsets)
are accounted for, not double counted. Impacts come from dataset/retrofit_catalogue (impact_model) -> config.PARAMS.
"""
import copy
import math
import numpy as np
import pandas as pd
from . import config as C
from .scoring import insulation_score

GAS_HEAT = {"gas_boiler", "gas_warm_air", "gas_room_heaters"}
ELEC_HEAT = {"electric_direct", "electric_storage"}
HP = {"heat_pump_air", "heat_pump_ground"}
SOLID_WALLS = {"solid_brick", "stone", "system_built"}
HOUSE_LIKE = {"House", "Bungalow"}
NAN = float("nan")


def _isnan(x):
    return x is None or (isinstance(x, float) and math.isnan(x))


def _loft_cut(p):
    """Catalogue: 0 mm -> 15%, <100 mm -> 8%, 100-199 mm -> 3%, >=200 mm -> 0. Depth unknown: by roof insulation category."""
    par = C.PARAMS
    if not _isnan(p.get("loft_mm")):
        d = p["loft_mm"]
        return par["loft_by_depth"]["zero"] if d <= 0 else par["loft_by_depth"]["lt100"] if d < 100 else par["loft_by_depth"]["lt200"] if d < 200 else 0.0
    return par["loft_by_cat"].get(p.get("roof_insulation"), 0.0)


def needs_info(p: dict) -> dict:
    """{retrofit: what to confirm} for measures that cannot be judged because the home record does not say (unknown is NOT 'already fine' and NOT 'not possible')."""
    q = {}
    pitched = p.get("roof_type") in ("pitched", "roof_room")
    if pitched and _isnan(p.get("loft_mm")) and p.get("roof_insulation") not in ("none", "limited", "insulated"):
        q["loft_insulation"] = "the existing loft insulation depth is not known: confirm it before savings can be estimated"
    if p.get("floor_type") in ("solid", "suspended") and p.get("floor_insulation") not in ("none", "limited", "insulated", "not_applicable"):
        q["floor_insulation"] = "the floor construction or insulation is not known: confirm it before savings can be estimated"
    if p.get("wall_type") == "cavity" and _isnan(p.get("wall_insulation_level")):
        q["cavity_wall_insulation"] = "whether the cavity walls are already insulated is not known: confirm it before savings can be estimated"
    if p.get("wall_type") in SOLID_WALLS and _isnan(p.get("wall_insulation_level")):
        q["solid_wall_insulation"] = "whether the solid walls are already insulated is not known: confirm it before savings can be estimated"
    if _isnan(p.get("glazing_level")):
        q["double_glazing"] = "the glazing type is not known: confirm it before savings can be estimated"
    if _isnan(p.get("controls_level")) and (p.get("heating_detail") in GAS_HEAT or p.get("heating_detail") in ELEC_HEAT or p.get("heating_detail") in HP):
        q["smart_controls"] = "the existing heating controls are not known: confirm them before savings can be estimated"
    if p.get("heating_detail") == "gas_boiler" and _isnan(p.get("boiler_condensing")):
        q["condensing_boiler"] = "whether the boiler is condensing is not known: confirm it before savings can be estimated"
    if p.get("property_type") in HOUSE_LIKE and _isnan(p.get("has_solar_pv")):
        q["solar_pv"] = "whether the home already has solar panels is not known: confirm it before savings can be estimated"
    return q


def feasibility(p: dict) -> dict:
    """-> {retrofit: (feasible, reason)} using the catalogue applicability rules."""
    f = {}
    if p["fuel_scope"] != "gas_elec":
        why = "Outside grid-electricity + gas accounting (community heat / other fuel): savings not estimated"
        return {r: (False, why) for r in C.ORDER}
    hd, wt, wl = p["heating_detail"], p["wall_type"], p.get("wall_insulation_level")
    roof = p["roof_type"]
    pitched = roof in ("pitched", "roof_room")
    f["loft_insulation"] = (pitched and _loft_cut(p) > 0,
                            "Loft/roof insulation below ~200 mm" if pitched and _loft_cut(p) > 0 else
                            ("Not a pitched roof" if not pitched else "Loft already adequately insulated"))
    f["cavity_wall_insulation"] = (wt == "cavity" and wl in (0, 1), "Cavity wall without full insulation" if wt == "cavity" and wl in (0, 1) else "No uninsulated cavity wall")
    f["solid_wall_insulation"] = (wt in SOLID_WALLS and wl in (0, 1), "Solid/system-built wall without full insulation" if wt in SOLID_WALLS and wl in (0, 1) else "No uninsulated solid wall")
    ft = p["floor_type"]; fi = p["floor_insulation"]
    f["floor_insulation"] = (ft in ("solid", "suspended") and fi == "none", "Ground floor without insulation" if ft in ("solid", "suspended") and fi == "none" else "No uninsulated ground floor")
    gl = p.get("glazing_level")
    f["double_glazing"] = (not _isnan(gl) and gl <= 2, "Single/partial double glazing" if not _isnan(gl) and gl <= 2 else ("Glazing unknown" if _isnan(gl) else "Already double glazed or better"))
    cl = p.get("controls_level")
    f["smart_controls"] = (not _isnan(cl) and cl < 3 and (hd in GAS_HEAT or hd in ELEC_HEAT or hd in HP),
                           "Controls below zoned/smart level" if not _isnan(cl) and cl < 3 else "Zoned/smart controls already present")
    hp_ok = p["property_type"] in HOUSE_LIKE and (hd in GAS_HEAT or hd in ELEC_HEAT)
    f["heat_pump"] = (hp_ok, "Replaces gas/electric heating" if hp_ok else ("Heat pump already installed" if hd in HP else
                      "Flat/maisonette: limited outdoor space for the unit" if p["property_type"] not in HOUSE_LIKE else "Heating system not replaceable by this measure"))
    cb = hd == "gas_boiler" and p.get("boiler_condensing") is False
    f["condensing_boiler"] = (cb, "Non-condensing gas boiler" if cb else "Boiler already condensing / not a gas boiler")
    sol = p["property_type"] in HOUSE_LIKE and roof in ("pitched", "flat") and p.get("has_solar_pv") is False
    f["solar_pv"] = (sol, "Roof available, no existing PV" if sol else
                     ("Solar already installed" if p.get("has_solar_pv") is True else "PV status unknown: confirm" if _isnan(p.get("has_solar_pv")) and p["property_type"] in HOUSE_LIKE
                      else "Flat/maisonette or unsuitable roof"))
    for r, why in needs_info(p).items():             # unknown input -> say so; never claim 'already insulated' / 'not possible'
        if not f[r][0]: f[r] = (False, "Status unknown: " + why)
    return f


def cost_range(r):
    c = C.CATALOGUE.loc[r]
    return float(c.indicative_cost_low_gbp), float(c.indicative_cost_high_gbp)


def _initial(p, elec, gas, par):
    """Split baseline use into space-heating demand (useful heat), hot-water gas, cooking."""
    hd = p["heating_detail"]
    st = {"elec": elec, "gas": gas, "hd": hd, "gas_hw": 0.0, "gas_cook": 0.0, "D": 0.0, "eff": 1.0,
          "cop": par["scop"], "glazing": p.get("glazing_level"), "solar": 0.0}
    if hd in GAS_HEAT:
        cond = p.get("boiler_condensing") if hd == "gas_boiler" else None
        eff = par["boiler_eff"][cond if cond in (True, False) else None] if hd == "gas_boiler" else par["other_gas_eff"]
        cook = gas * par["gas_cooking_share"]
        hc, wc = p.get("epc_heating_cost_current") or 0, p.get("epc_hot_water_cost_current") or 0
        hs = hc / (hc + wc) if (p.get("hot_water_fuel") == "gas" and hc + wc > 0) else 1.0
        usable = gas - cook
        st.update(eff=eff, gas_cook=cook, gas_hw=usable * (1 - hs), D=usable * hs * eff)
    elif hd in ELEC_HEAT:
        st["D"] = elec * par["elec_heat_share"]
    elif hd in HP:
        st["D"] = elec * par["hp_heat_share"] * par["scop"]
    return st


def simulate(p: dict, elec: float, gas: float, selected, par=None) -> dict:
    par = par or C.PARAMS
    sel = [r for r in C.ORDER if r in set(selected)]
    st = _initial(p, elec, gas, par); steps, notes = [], []
    cur = (st["elec"], st["gas"])

    def cut(r):  # reduce space-heating demand by fraction r on the current system
        old = st["D"]; st["D"] = old * (1 - r); sv = old - st["D"]
        hd = st["hd"]
        if hd in GAS_HEAT: st["gas"] -= sv / st["eff"]
        elif hd in ELEC_HEAT: st["elec"] -= sv
        elif hd in HP: st["elec"] -= sv / st["cop"]

    for r in sel:
        if r == "loft_insulation": cut(_loft_cut(p))
        elif r == "cavity_wall_insulation": cut(par["cavity"].get(p.get("wall_insulation_level"), 0.0))
        elif r == "solid_wall_insulation": cut(par["solid"].get(p.get("wall_insulation_level"), 0.0))
        elif r == "floor_insulation": cut(par["floor"].get(p.get("floor_type"), 0.0))
        elif r == "double_glazing": cut(par["glazing"].get(st["glazing"], 0.0))
        elif r == "smart_controls": cut(par["controls"])
        elif r == "heat_pump":
            hd = st["hd"]
            if hd in GAS_HEAT:
                hw_useful = st["gas_hw"] * st["eff"]
                st["gas"] -= st["D"] / st["eff"] + st["gas_hw"]
                st["elec"] += st["D"] / par["scop"] + hw_useful / par["scop_dhw"]
            elif hd in ELEC_HEAT:
                st["elec"] += st["D"] / par["scop"] - st["D"]
            st["hd"] = "heat_pump_air"; st["cop"] = par["scop"]; st["eff"] = 1.0; st["gas_hw"] = 0.0
        elif r == "condensing_boiler":
            if st["hd"] in HP:
                notes.append("Condensing boiler skipped: replaced by the heat pump.")
            elif st["hd"] == "gas_boiler" and st["eff"] < par["boiler_new_eff"]:
                f = st["eff"] / par["boiler_new_eff"]
                st["gas"] -= (st["D"] / st["eff"] + st["gas_hw"]) * (1 - f)
                st["gas_hw"] *= f; st["eff"] = par["boiler_new_eff"]
        elif r == "solar_pv":
            su = par["self_use"]
            gen = par["solar_kwp"] * par["solar_yield"].get(p.get("climate_region"), 900) * su
            st["elec"] -= min(gen, max(st["elec"], 0.0)); st["solar"] = par["solar_kwp"]
        steps.append({"retrofit": r, "d_elec": cur[0] - st["elec"], "d_gas": cur[1] - st["gas"]})
        cur = (st["elec"], st["gas"])
    return {"steps": steps, "after": st, "notes": notes}


def carbon_saving(d_elec, d_gas):
    """Delta C (kg CO2e/yr) = sum_f dE_f * EF_f ; positive = reduction."""
    return d_elec * C.EMISSION_FACTORS["elec"] + d_gas * C.EMISSION_FACTORS["gas"]


def bills(d_elec, d_gas):
    return d_elec * C.TARIFF["elec"] + d_gas * C.TARIFF["gas"]


def sap_after(sap: float, baseline: dict, after: dict, p: dict) -> float:
    """Post-retrofit SAP from the SAP cost relation: SAP = 100-13.95*ECF (ECF<3.5) else 117-121*log10(ECF);
    ECF is proportional to running cost, so ECF_after = ECF_before * cost_after/cost_before. The cost ratio is taken on the
    regulated (heating + hot water) part of the engine's baseline, scaled to the EPC's own modelled heating+hot-water cost.
    Starting point is the REAL recorded SAP score. Validated against the EPC's own potential SAP (train.py)."""
    ecf0 = (100 - sap) / 13.95 if sap > 51.2 else 10 ** ((117 - sap) / 121)
    reg_cost_b = baseline["gas"] * (1 - C.PARAMS["gas_cooking_share"]) * C.TARIFF["gas"] if p["heating_detail"] in GAS_HEAT \
        else baseline["elec"] * C.PARAMS["elec_heat_share"] * C.TARIFF["elec"]
    d_cost = bills(baseline["elec"] - after["elec"], baseline["gas"] - after["gas"])
    epc_reg = (p.get("epc_heating_cost_current") or 0) + (p.get("epc_hot_water_cost_current") or 0)
    epc_tot = epc_reg + (p.get("epc_lighting_cost_current") or 0)
    if reg_cost_b <= 0 or epc_tot <= 0:
        return sap
    d_epc = d_cost * epc_reg / reg_cost_b
    ratio = max((epc_tot - d_epc) / epc_tot, 0.05)
    ecf1 = ecf0 * ratio
    s1 = 100 - 13.95 * ecf1 if ecf1 < 3.5 else 117 - 121 * math.log10(ecf1)
    return float(min(100.0, sap + max(s1 - sap, 0.0) * C.SAP_GAIN_SCALE))


def band_of(sap: float) -> str:
    for b, lo in C.SAP_BANDS:
        if sap >= lo: return b
    return "G"


def analyse_scenario(p: dict, elec: float, gas: float, selected, par=None) -> dict:
    feas = feasibility(p)
    sel = [r for r in C.ORDER if r in set(selected) and feas[r][0]]
    res = simulate(p, elec, gas, sel, par); a = res["after"]
    per = []
    for s in res["steps"]:
        lo, hi = cost_range(s["retrofit"])
        per.append({**s, "carbon_kg": carbon_saving(s["d_elec"], s["d_gas"]), "cost_low": lo, "cost_high": hi,
                    "cost_gbp": (lo + hi) / 2, "bill_saving_gbp": bills(s["d_elec"], s["d_gas"])})
    d_e, d_g = elec - a["elec"], gas - a["gas"]
    eb, ea = elec + gas, a["elec"] + a["gas"]
    sap1 = sap_after(float(p["sap_score"]), {"elec": elec, "gas": gas}, a, p) if sel else float(p["sap_score"])
    return {"selected": sel, "per_retrofit": per,
            "baseline": {"elec": elec, "gas": gas, "total": eb}, "after": {"elec": a["elec"], "gas": a["gas"], "total": ea},
            "saving": {"elec": d_e, "gas": d_g, "total": d_e + d_g},
            "improvement_potential_pct": (100 * (eb - ea) / eb) if eb and eb > 0 else None,
            "carbon_saving_kg": carbon_saving(d_e, d_g), "bill_saving_gbp": bills(d_e, d_g),
            "cost_gbp": sum(x["cost_gbp"] for x in per), "cost_low": sum(x["cost_low"] for x in per), "cost_high": sum(x["cost_high"] for x in per),
            "sap_before": float(p["sap_score"]), "sap_after": sap1, "rating_after": band_of(sap1),
            "new_state": {"glazing_level": a["glazing"] if "double_glazing" not in sel else max(a["glazing"] or 0, 3),
                          "heating_detail": a["hd"], "solar_kwp_est": (p.get("solar_kwp_est") or 0) + a["solar"],
                          "controls_level": 3 if "smart_controls" in sel else p.get("controls_level"),
                          "wall_insulation_level": 2 if ("cavity_wall_insulation" in sel or "solid_wall_insulation" in sel) else p.get("wall_insulation_level"),
                          "loft_mm": 270 if "loft_insulation" in sel else p.get("loft_mm"),
                          "roof_insulation": "insulated" if "loft_insulation" in sel else p.get("roof_insulation"),
                          "floor_insulation": "insulated" if "floor_insulation" in sel else p.get("floor_insulation"),
                          "boiler_condensing": True if (a["hd"] == "gas_boiler" and a["eff"] >= C.PARAMS["boiler_new_eff"]) else p.get("boiler_condensing"),
                          "has_solar_pv": True if a["solar"] else p.get("has_solar_pv")},
            "notes": res["notes"]}


# ------------------------------------------------------------------ uncertainty (Monte Carlo over catalogue ranges)
# Ranges are the brief's illustrative ranges / the catalogue's [approx] notes, widened modestly (assumptions, documented here):
#   fabric & glazing impacts x U(0.8, 1.2)  (brief: loft 12-18%, glazing 8-12%  ~ +/-20%);  smart controls x U(0.6, 1.5)  (brief 5-10%);
#   SCOP U(2.4, 3.2), DHW SCOP U(2.1, 2.9);  boiler efficiencies +/- ~0.05;  solar yield x U(0.9, 1.1), self-use U(0.30, 0.55);
#   cooking share of gas U(0.02, 0.10);  electric heating share U(0.45, 0.65);  heat-pump home heating share U(0.35, 0.55).
def _draw_params(rng):
    P = dict(C.PARAMS); u = rng.uniform                 # shallow copy: every nested table below is replaced, none mutated
    scale = lambda d, lo=0.8, hi=1.2: {k: v * u(lo, hi) for k, v in d.items()}
    P["loft_by_depth"] = scale(P["loft_by_depth"]); P["loft_by_cat"] = scale(P["loft_by_cat"])
    P["cavity"] = scale(P["cavity"]); P["solid"] = scale(P["solid"]); P["floor"] = scale(P["floor"]); P["glazing"] = scale(P["glazing"])
    P["controls"] *= u(0.6, 1.5); P["scop"] = u(2.4, 3.2); P["scop_dhw"] = u(2.1, 2.9)
    P["boiler_eff"] = {True: u(0.80, 0.90), False: u(0.65, 0.78), None: u(0.72, 0.88)}; P["boiler_new_eff"] = u(0.82, 0.90); P["other_gas_eff"] = u(0.65, 0.78)
    P["solar_yield"] = scale(P["solar_yield"], 0.9, 1.1); P["self_use"] = u(0.30, 0.55)
    P["gas_cooking_share"] = u(0.02, 0.10); P["elec_heat_share"] = u(0.45, 0.65); P["hp_heat_share"] = u(0.35, 0.55)
    return P


def monte_carlo(p: dict, elec: float, gas: float, selected, n: int = 200, seed: int = 0) -> dict:
    """P10 / P50 / P90 of per-fuel savings, improvement potential and carbon for the package and each measure.
    Reflects PARAMETER uncertainty only (not behaviour, tariffs or model error). Labelled estimates, not guarantees."""
    rng = np.random.default_rng(seed); sel = [r for r in C.ORDER if r in set(selected)]
    de, dg, imp, co = [], [], [], []; steps = {r: ([], []) for r in sel}
    for _ in range(n):
        res = simulate(p, elec, gas, sel, _draw_params(rng)); a = res["after"]
        de.append(elec - a["elec"]); dg.append(gas - a["gas"]); imp.append(100 * (elec + gas - a["elec"] - a["gas"]) / (elec + gas) if elec + gas > 0 else np.nan)
        co.append(carbon_saving(de[-1], dg[-1]))
        for st_ in res["steps"]: steps[st_["retrofit"]][0].append(st_["d_elec"]); steps[st_["retrofit"]][1].append(st_["d_gas"])
    def q(x, f=1.0):   # P10 / P50 / P90, half-widths scaled by the calibration factor f (fitted on train to ~80% coverage of reference labels)
        lo, mid, hi = (float(v) for v in np.nanpercentile(x, [10, 50, 90])); return [mid - f * (mid - lo), mid, mid + f * (hi - mid)]
    S = C.UNCERT_SCALE; de, dg = np.array(de), np.array(dg)
    return {"n": n, "calibrated": C.CALIBRATED,
            "package": {"elec": q(de, S["elec"]), "gas": q(dg, S["gas"]), "total": q(de + dg, S["gas"]), "improvement_pct": q(imp, S["imp"]), "carbon_kg": q(co, S["carbon"])},
            "per_retrofit": {r: {"elec": q(v[0], S["elec"]), "gas": q(v[1], S["gas"]),
                                 "carbon_kg": q([carbon_saving(e, g) for e, g in zip(*v)], S["carbon"])} for r, v in steps.items()},
            "note": "P10-P90 over catalogue/parameter ranges, widened by a factor calibrated on train homes against reference savings. Estimates, not guarantees."}


def recommend(p: dict, elec: float, gas: float, par=None) -> dict:
    """Feasible retrofits only, fabric-first. Heat pump replaces a boiler upgrade. Also the fabric-led (no heat pump) variant."""
    feas = feasibility(p)
    chosen = [r for r in C.ORDER if feas[r][0]]
    if "heat_pump" in chosen and "condensing_boiler" in chosen:
        chosen.remove("condensing_boiler")
    pack = analyse_scenario(p, elec, gas, chosen, par)
    nohp = analyse_scenario(p, elec, gas, [r for r in chosen if r != "heat_pump"], par)
    excluded = [{"retrofit": r, "reason": feas[r][1]} for r in C.ORDER if not feas[r][0] or r not in chosen]
    recs = []
    ins = insulation_score({**p, **pack["new_state"]})       # fabric state AFTER the planned fabric measures
    fabric_ready = bool(pd.isna(ins) or ins >= 50)
    for i, s in enumerate(pack["per_retrofit"], 1):
        pb = s["cost_gbp"] / s["bill_saving_gbp"] if s["bill_saving_gbp"] > 1 else math.inf
        suit = "High" if pb <= C.PAYBACK_HIGH else "Medium" if pb <= C.PAYBACK_MED else "Low"
        reason = feas[s["retrofit"]][1]
        if s["retrofit"] == "heat_pump" and not fabric_ready:
            suit = {"High": "Medium", "Medium": "Low"}.get(suit, "Low")
            reason += f"; fabric still weak after planned measures (insulation score {ins:.0f}/100), so the heat pump runs less efficiently: insulate first"
        if s["d_elec"] < 0:
            reason += f"; electricity use rises {-s['d_elec']:.0f} kWh/yr while gas falls {s['d_gas']:.0f} kWh/yr"
        if s["bill_saving_gbp"] <= 0:
            reason += "; running costs do not fall at current tariffs"
        recs.append({**s, "priority": i, "suitability": suit, "payback_years": None if math.isinf(pb) else round(pb, 1),
                     "reason": reason, "label": C.LABEL[s["retrofit"]], "fabric_ready": fabric_ready if s["retrofit"] == "heat_pump" else None})
    return {"recommendations": recs, "excluded": excluded, "package": pack, "package_no_hp": nohp}

"""Pipeline entry point: property + usage -> features -> score -> efficiency detector -> retrofit engine ->
savings / carbon / value -> payload (consumed by the LLM layer and the dashboard)."""
import numpy as np
import pandas as pd
from . import config as C
from .features import build_master
from .scoring import green_score, key_issues, score_df
from .retrofits import recommend, analyse_scenario, feasibility, monte_carlo, needs_info
from .breakit import conflict_flags
from .models import load
from .custom import cost_reference, load_reference


class GreenEngine:
    def __init__(self, lite: bool = False):
        """lite=True: models only (~0.2 GB, ~1 s) for customer-entered homes; dataset lookups (prop, search, portfolio) are unavailable."""
        self.df = None if lite else build_master().set_index("property_id", drop=False)
        self.ref = load_reference() if lite else cost_reference(self.df)     # what custom.build_property needs from the dataset
        self.em, self.em_lean, self.vm = load("energy_model"), load("energy_model_lean"), load("value_model")
        self.rel = load("relevance_model")

    # ------------------------------------------------------------------ helpers
    def prop(self, pid: str) -> dict:
        p = self.df.loc[pid].to_dict()
        for k, v in p.items():
            if v is pd.NA: p[k] = np.nan
        p["boiler_condensing"] = None if pd.isna(p["boiler_condensing"]) else bool(p["boiler_condensing"])
        p["has_solar_pv"] = None if pd.isna(p["has_solar_pv"]) else bool(p["has_solar_pv"])
        return p

    def baseline(self, p: dict):
        """Metered annualised usage; if unavailable (<6 months / no winter month) fall back to the energy model, flagged 'modelled'."""
        if p["usage_status"] == "metered":
            return float(p["elec_annual"]), float(p["gas_annual"]), "metered"
        m = self.em if not pd.isna(p.get("epc_primary_kwh_m2")) else self.em_lean   # lean model for customer-entered homes
        e, g = m.predict(pd.DataFrame([p]))
        return float(e[0]), float(g[0]), "modelled"

    def search(self, text: str, limit=200):
        t = text.strip().upper()
        if t in self.df.index: return [t]
        k = t.replace(" ", "")
        if not k: return []
        m = self.df.postcode.str.upper().str.replace(" ", "", regex=False).str.startswith(k)
        return self.df.index[m][:limit].tolist()

    # ------------------------------------------------------------------ main API
    def analyse(self, pid: str, scenario: list = None) -> dict:
        return self.analyse_property(self.prop(pid), scenario)

    def analyse_property(self, p: dict, scenario: list = None, exclude: dict = None) -> dict:
        """Core pipeline for ONE property record (a dataset home or a customer-entered home). exclude: {retrofit: reason} kept out of the default plan."""
        elec, gas, src = self.baseline(p)
        p_s = dict(p, intensity=p["intensity"] if src == "metered" else np.nan)   # modelled usage never feeds the score
        sc = green_score(p_s)
        feas = feasibility(p)
        accounted = p["fuel_scope"] == "gas_elec"
        out = {"property": {k: (None if (isinstance(p[k], float) and np.isnan(p[k])) else p[k]) for k in [
                   "property_id", "postcode", "local_authority", "property_type", "built_form", "age_band", "floor_area", "habitable_rooms",
                   "energy_rating", "sap_score", "potential_rating", "potential_sap", "heating_detail", "wall_type", "wall_insulation",
                   "loft_mm", "glazing", "controls_label", "has_solar_pv", "solar_kwp_est", "current_value_estimate", "value_source", "fuel_scope", "tenure"]},
               "data_quality": {"usage_source": src, "elec_months": int(p["elec_months"]) if not pd.isna(p["elec_months"]) else None,
                                "gas_months": int(p["gas_months"]) if not pd.isna(p["gas_months"]) else None,
                                "score_partial": sc["partial"], "savings_available": accounted,
                                "flags": [k for k in ["flag_tiny_floor_area", "flag_rooms_implausible", "flag_missing_photo_supply"] if p.get(k)], "conflicts": conflict_flags(p),
                                "user_entered": p.get("property_id") == "YOUR-HOME",
                                "unavailable_reason": None if accounted else "Heating outside grid-electricity + gas accounting (community heat / other fuel)"},
               "score": {**sc, "intensity_kwh_m2": None if pd.isna(p_s["intensity"]) else round(float(p_s["intensity"]), 1),
                         "key_issues": key_issues(p_s, sc), "is_poor": sc["classification"] in ("Poor", "Very poor")},
               "emission_factors": {**C.EMISSION_FACTORS, "source": C.EMISSION_SOURCE}}
        out["needs_information"] = [{"retrofit": r, "question": q} for r, q in needs_info(p).items()]
        if not accounted:
            out.update({"recommendations": [], "excluded": [{"retrofit": r, "reason": feas[r][1]} for r in C.ORDER[:1]],
                        "scenario": {"retrofits": [], "result": None, "score_after": None, "value": None, "infeasible_requested": [],
                                     "is_default_package": True,
                                     "label": "Savings, carbon and improvement potential unavailable for this heating type."}})
            return out
        rec = recommend(p, elec, gas, exclude=exclude)
        ml = self.rel.predict_property(p, [r["retrofit"] for r in rec["recommendations"]])    # learned relevance + confidence; 'needs survey' when unsure
        for r in rec["recommendations"]: r["ml_relevance"] = ml.get(r["retrofit"])
        default = rec["package"]["selected"]
        want = default if scenario is None else [r for r in C.ORDER if r in scenario]
        infeasible = [{"retrofit": r, "reason": feas[r][1], "needs_info": feas[r][1].startswith("Status unknown")} for r in want if not feas[r][0]]
        scen = analyse_scenario(p, elec, gas, want)
        if "heat_pump" in scen["selected"] and "condensing_boiler" in scen["selected"]:
            pass
        sel = scen["selected"]
        d_total = scen["saving"]["total"]
        p_after = dict(p, **scen["new_state"], sap_score=scen["sap_after"], energy_rating=scen["rating_after"],
                       intensity=(p_s["intensity"] - d_total / p["floor_area"]) if src == "metered" and not pd.isna(p_s["intensity"]) else np.nan)
        sc_after = green_score(p_after)
        uplift = self.vm.uplift(p, scen["sap_after"]) if sel else None
        unc = monte_carlo(p, elec, gas, sel, n=150) if sel else None
        out.update({"recommendations": rec["recommendations"], "excluded": rec["excluded"], "package_no_hp": rec["package_no_hp"],
                    "scenario": {"retrofits": sel, "is_default_package": scenario is None, "infeasible_requested": infeasible,
                                 "result": scen, "score_after": sc_after, "value": uplift, "uncertainty": unc,
                                 "label": "ESTIMATES, not guarantees. Value impact is an indicative, associational range, not a causal effect."}})
        return out

    # ------------------------------------------------------------------ portfolio / efficiency detector
    def portfolio(self, refresh=False) -> pd.DataFrame:
        f = C.CACHE / "portfolio.parquet"
        if f.exists() and not refresh:
            return pd.read_parquet(f)
        return build_portfolio(self)


def build_portfolio(eng: GreenEngine) -> pd.DataFrame:
    """Poor / Very poor homes ranked by improvement potential (% cut in purchased grid + gas energy, same convention both sides).
    Unavailable (NaN + reason) for non grid+gas homes or zero baseline. Large homes are judged on intensity, not total use."""
    s = score_df(eng.df)
    poor = s[s.classification.isin(["Poor", "Very poor"])]
    rows = []
    for p in poor.to_dict("records"):
        reason, ip, ip2, de, dg, co, cost = None, np.nan, np.nan, np.nan, np.nan, np.nan, np.nan
        measures = ""
        if p["fuel_scope"] != "gas_elec":
            reason = "heating outside grid+gas accounting"
        else:
            e, g, src = eng.baseline(p)
            if e + g <= 0:
                reason = "zero baseline energy"
            else:
                r = recommend(p, e, g); a = r["package"]
                ip, ip2 = a["improvement_potential_pct"], r["package_no_hp"]["improvement_potential_pct"]
                de, dg, co, cost = a["saving"]["elec"], a["saving"]["gas"], a["carbon_saving_kg"] / 1000, a["cost_gbp"]
                measures = "+".join(a["selected"])
        sc = {"components": {k: {"sub_score": None if pd.isna(p[f"s_{k}"]) else p[f"s_{k}"]} for k in C.WEIGHTS}}
        rows.append({"property_id": p["property_id"], "postcode": p["postcode"], "local_authority": p["local_authority"],
                     "score": p["score"], "classification": p["classification"], "energy_rating": p["energy_rating"],
                     "intensity_kwh_m2": p["intensity"], "floor_area": p["floor_area"], "improvement_potential_pct": ip,
                     "improvement_potential_no_hp_pct": ip2, "elec_saving_kwh": de, "gas_saving_kwh": dg, "carbon_saving_t": co,
                     "package_cost_gbp": cost, "measures": measures, "unavailable_reason": reason,
                     "key_issues": "; ".join(key_issues(p, sc)[:3])})
    pf = pd.DataFrame(rows).sort_values("improvement_potential_pct", ascending=False, na_position="last").reset_index(drop=True)
    pf["rank"] = pf.improvement_potential_pct.rank(ascending=False, method="first")
    C.CACHE.mkdir(parents=True, exist_ok=True); pf.to_parquet(C.CACHE / "portfolio.parquet")
    return pf

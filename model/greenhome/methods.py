"""Transparency payload for the web app's "How we calculate" page: every figure is read from the engine's own constants and reports,
so the page cannot drift from what the engine does."""
import json
from functools import lru_cache
from . import config as C

LABELS = {"energy_efficiency": "Recorded energy rating", "energy_intensity": "Energy use per m2", "insulation": "Insulation",
          "heating": "Heating system", "glazing": "Glazing", "renewable": "Renewables", "smart": "Smart controls"}
SPLITS = {"val": "Validation", "test": "Test", "geo_test": "Liverpool (unseen city)"}
TIERS = [{"id": "A", "name": "Independent", "text": "Checked against real EPC certificates and real sales, which the engine never saw."},
         {"id": "B", "name": "Partly circular", "text": "Checked against simulated labels that share the retrofit catalogue with the engine, so high agreement is expected."},
         {"id": "C", "name": "Rule re-learning", "text": "The relevance classifier re-learns a rule applied to simulated savings."}]
VALUE = {"formula": "uplift = exp(beta x (SAP after - SAP before)) - 1, where beta is the rating premium estimated from real sales",
         "range": "2.5th to 97.5th percentile of a pooled bootstrap of four model specifications, floored at zero, applied to the current value estimate",
         "note": "Indicative, associational range from historical sales relationships, not a causal increase or a guarantee.",
         "unavailable": "Not shown when there is no current value estimate or no measure is selected."}
LIMITATIONS = [
    "Usage is simulated (anchored to real homes and real postcode statistics). Agreement with simulated labels does not prove real-world accuracy.",
    "The relevance classifier's labels are a rule on simulated savings; its ceiling is set by hidden simulator state.",
    "Many constants are approximate: boiler efficiencies, heat-pump SCOP 2.8, solar yield, tariffs (indicative, not looked up per region or quarter), the catalogue impact percentages and cost ranges.",
    "The SAP after a retrofit is a simplified running-cost estimate that never falls below the current SAP, and is least validated for heat-pump packages.",
    "The value range is not reliable across cities (the premium observed in held-out sales fell outside our range in 2 of 3 splits); the unseen-city price level is much less accurate than in known cities. About 81% of current values are model estimates because only 19% of homes match a real sale.",
    "The data covers 10 English and Welsh councils, over-represents rented homes and flats, and has no rural homes, Scotland or Northern Ireland.",
    "The language model's own explanations and the what-if parser have not been evaluated at scale; only the template, the guardrail and the rules were.",
    "The guardrail cannot catch an invented non-numeric statement about the home.",
    "Monte Carlo bands cover parameter uncertainty only.",
]


def _table(title, headers, rows, note=None):
    return {"title": title, "headers": headers, "rows": [[str(c) for c in r] for r in rows], **({"note": note} if note else {})}


def _interp(title, xl, xs, ys, unit=""):
    return _table(title, [xl, "Sub-score"], [[f"{x}{unit}", y] for x, y in zip(xs, ys)], "Linear between these points; the end values apply beyond them.")


def _mappings():
    h = {"energy_efficiency": ("The recorded EPC SAP score (1-100), used as it is.", [_table("SAP to sub-score", ["SAP", "Sub-score"], [["1 to 100", "= SAP (clipped to 1-100)"]])]),
         "energy_intensity": ("Annualised metered delivered energy per m2. Needs at least {} observed months including a winter month.".format(C.MIN_MONTHS),
                              [_interp("kWh/m2/yr to sub-score (lower is better)", "kWh/m2/yr", C.INTENSITY_X, C.INTENSITY_Y)]),
         "insulation": ("Weighted mean of the parts that apply; a part that does not apply or is unknown is left out, not penalised.",
                        [_table("Part weights", ["Part", "Weight"], [[k, v] for k, v in C.INS_W.items()]),
                         _table("Wall insulation level", ["Level (0 = none, higher = better)", "Sub-score"], C.WALL_LEVEL_SCORE.items()),
                         _interp("Loft depth (when stated)", "mm", C.LOFT_X, C.LOFT_Y),
                         _table("Roof insulation (when depth is not stated)", ["State", "Sub-score"], C.ROOF_CAT_SCORE.items()),
                         _table("Floor insulation", ["State", "Sub-score"], C.FLOOR_SCORE.items())]),
         "heating": ("Ordered by the efficiency and carbon intensity of the system.",
                     [_table("System to sub-score", ["System", "Sub-score"], sorted(C.HEATING_SCORE.items(), key=lambda kv: -kv[1]))]),
         "glazing": ("Glazing level from single to triple.", [_table("Level to sub-score", ["Level", "Sub-score"], C.GLAZING_LEVEL_SCORE.items())]),
         "renewable": ("Estimated solar PV size; unknown PV status is excluded rather than scored as none.", [_interp("kWp to sub-score", "kWp", C.SOLAR_X, C.SOLAR_Y)]),
         "smart": ("The EPC has no smart-thermostat field, so this comes from the heating controls reported.", [_table("Controls level to sub-score", ["Level (3 = smart or zoned)", "Sub-score"], C.CONTROLS_SCORE.items())])}
    return [{"key": k, "label": LABELS[k], "weight": w, "summary": h[k][0], "tables": h[k][1]} for k, w in C.WEIGHTS.items()]


def _json(name):
    f = C.REPORTS / name
    return json.loads(f.read_text()) if f.exists() else {}


def _get(d, path):
    for p in path.split("/"):
        d = d.get(p) if isinstance(d, dict) else None
    return d if isinstance(d, (int, float)) and d == d else None


def _row(src, label, unit, tier, path, base=None, lower_better=False, target=None):
    """One results-table row: the same path read in each split ('{s}' is replaced), and the baseline's path."""
    v = {s: _get(src, path.format(s=s)) for s in SPLITS}
    b = {s: _get(src, base.format(s=s)) for s in SPLITS} if base else None
    if all(x is None for x in v.values()):
        return None
    return {"label": label, "unit": unit, "tier": tier, "betterWhen": "lower" if lower_better else "higher", "values": v, "baseline": b, "target": target}


def _metrics():
    m, a = _json("metrics.json"), _json("app_metrics.json")
    sap = "sap_estimator/{s}/bill_totals/"
    rows = [
        _row(m, "Independent check: engine SAP gain vs the real EPC's potential gain (correlation)", "r", "A", "independent_epc_check/{s}/dSAP_corr"),
        _row(m, "Independent check: SAP gain error vs the real EPC (MAE)", "SAP points", "A", "independent_epc_check/{s}/dSAP_mae", lower_better=True),
        _row(m, "House price median error", "%", "A", "value_model/{s}/median_ape_pct", "value_model/{s}/baseline_outcode_pm2_median_ape_pct", True),
        _row(m, "Gas model MAE", "kWh", "B", "energy_model/{s}/gas_mae", "energy_model/{s}/gas_baseline_mae", True),
        _row(m, "Electricity model MAE", "kWh", "B", "energy_model/{s}/elec_mae", "energy_model/{s}/elec_baseline_mae", True),
        _row(m, "Engine improvement ranking vs simulated labels (Spearman) against ranking by EPC rating", "rho", "B",
             "engine_vs_reference/{s}/improvement_rank_spearman", "engine_vs_reference/{s}/baseline_rank_by_epc_rating_spearman"),
        _row(m, "P10-P90 band coverage of the gas saving", "share", "B", "monte_carlo_coverage/{s}/gas_saving", target=_get(m, "monte_carlo_coverage/val/target_P10_P90")),
        _row(m, "Relevance classifier macro-F1 (informative measures) vs popularity baseline", "F1", "C",
             "relevance_model/{s}/informative_measures_only/macro_f1", "relevance_model/{s}/informative_measures_only/baseline_popularity_macro_f1"),
        _row(a, "SAP estimator from the app's questions: MAE vs type-by-age median", "SAP points", "B", sap + "mae_sap", "sap_estimator/{s}/baseline_type_x_age_median_mae_sap", True),
        _row(a, "SAP estimator: band within one", "share", "B", sap + "band_within_one"),
        _row(a, "SAP estimator: P10-P90 coverage", "share", "B", sap + "p10_p90_coverage", target=0.8),
    ]
    prod = (m.get("value_model") or {}).get("rating_premium_production_train_plus_val") or {}
    held = (m.get("value_model") or {}).get("heldout_premium_check") or {}
    return {"splits": SPLITS, "tiers": TIERS, "rows": [r for r in rows if r], "nHomes": m.get("n_homes"), "note": m.get("notes"),
            "ratingPremium": {"pctPer10Sap": prod.get("pct_per_10_sap"), "nSales": prod.get("n_sales"),
                              "heldOutPctPer10Sap": {s: (held.get(s) or {}).get("premium_pct_per_10_sap") for s in SPLITS}}}


@lru_cache(maxsize=1)
def methods() -> dict:
    cat = C.CATALOGUE
    return {
        "score": {"formula": "Score = sum of weight x sub-score over the components that are known; unknown components are left out and the weights renormalised (the score is then flagged provisional).",
                  "weights": [{"key": k, "label": LABELS[k], "weight": w} for k, w in C.WEIGHTS.items()],
                  "classes": [{"min": lo, "label": n} for lo, n in C.CLASSES], "components": _mappings()},
        "carbon": {"formula": "Delta C = Delta E_elec x EF_elec + Delta E_gas x EF_gas", "unit": "kg CO2e per kWh",
                   "factors": [{"fuel": "Electricity", "value": C.EMISSION_FACTORS["elec"]}, {"fuel": "Gas", "value": C.EMISSION_FACTORS["gas"]}],
                   "source": C.EMISSION_SOURCE, "tariffs": {"unit": "GBP per kWh", "electricity": C.TARIFF["elec"], "gas": C.TARIFF["gas"],
                   "note": "Indicative rates of the order of the Ofgem price cap, used only for payback and suitability, never for energy or carbon."}},
        "retrofits": [{"id": i, "label": C.LABEL.get(i, r["name"]), "name": r["name"], "applicability": r["applicability_rule"], "impact": r["impact_model"],
                       "impactSource": r["impact_source"], "costLowGbp": float(r["indicative_cost_low_gbp"]), "costHighGbp": float(r["indicative_cost_high_gbp"]),
                       "costSource": r["cost_source"], "order": int(r["fabric_first_order"])} for i, r in cat.iterrows()],
        "payback": {"highYears": C.PAYBACK_HIGH, "mediumYears": C.PAYBACK_MED, "rule": "payback = mid cost / annual bill saving; High up to the first limit, Medium up to the second, otherwise Low."},
        "value": VALUE | {"ratingPremium": _metrics()["ratingPremium"]},
        "finance": C.FINANCE,
        "evidence": _metrics(),
        "limitations": LIMITATIONS,
    }

"""Print the headline benchmark from reports/metrics.json (and reports/llm_eval.json if present).
    python -m greenhome.train && python -m greenhome.benchmark"""
import json
import pandas as pd
from . import config as C

pd.set_option("display.width", 200, "display.float_format", lambda x: f"{x:,.3f}")
S = ("val", "test", "geo_test")


def tab(title, rows):
    print(f"\n== {title}"); print(pd.DataFrame(rows, index=S).T)


def main():
    M = json.load(open(C.REPORTS / "metrics.json")); g = lambda k, f: [M[k][s][f] for s in S]
    print("Splits: val/test = held-out postcodes in the 9 training councils; geo_test = Liverpool, a city no model has seen.")
    print("\n################ A. INDEPENDENT EVIDENCE (real EPC data / real sales) ################")
    I = M["independent_epc_check"]; tab("Engine applied to the measures the real EPC recommended vs the EPC's own potential-SAP gain (after calibration on train)",
        {k: [I[s][k] for s in S] for k in ("n_homes", "engine_dSAP_mean", "epc_dSAP_mean", "dSAP_mae", "dSAP_corr", "dSAP_spearman")})
    e = M["engine_vs_reference"]; tab("Rank agreement with the EPC's own improvement potential", {"spearman": [e[s]["vs_epc_potential_improvement_spearman"] for s in S]})
    h = M["value_model"]["heldout_premium_check"]; lo, hi = M["value_model"]["rating_premium_trainonly"]["ci95_pct_per_10_sap"]
    print(f"\n== Rating premium (% price per 10 SAP points): our train-only range {lo:.2f} to {hi:.2f}; production fit {M['value_model']['rating_premium_production_train_plus_val']['pct_per_10_sap']:.2f}")
    print("   held-out premium actually observed in real sales:", {s: (h[s]["premium_pct_per_10_sap"], "inside" if h[s]["inside_our_train_only_range"] else "OUTSIDE") for s in S})
    print("   by council (train):", {k: v["pct_per_10_sap"] for k, v in M["value_model"]["premium_by_council_train"].items()}, "  [dataset DATA.md reference 4.2%, fitted on all sales]")
    mc = M["monte_carlo_coverage"]; tab("Monte Carlo P10-P90 savings bands: share of reference savings inside (target 0.80)", {k: [mc[s][k] for s in S] for k in ("elec_saving", "gas_saving", "improvement_pct", "carbon")})
    v = M["value_model"]; tab("Home price (median APE %, lower better); model is anchored on the public council HPI price; geo_test = unseen city (still less accurate than in known cities)", {"model": [v[s]["median_ape_pct"] for s in S], "baseline: outcode GBP/m2": [v[s]["baseline_outcode_pm2_median_ape_pct"] for s in S], "baseline: council HPI average for the type": [v[s]["baseline_hpi_council_type_average_median_ape_pct"] for s in S],
                                                                                                                    "within-set rank spearman": [v[s]["within_split_rank_spearman"] for s in S]})
    tab("Energy model for homes without meter data (kWh/yr MAE) vs type x area median [against simulated usage]", {"gas model": g("energy_model", "gas_mae"), "gas baseline": g("energy_model", "gas_baseline_mae"),
                                                                                                             "elec model": g("energy_model", "elec_mae"), "elec baseline": g("energy_model", "elec_baseline_mae")})
    print("\n################ B. PARTLY CIRCULAR (simulated labels share the catalogue with our engine) ################")
    tab("Engine vs simulated reference labels", {k: [e[s][k] for s in S] for k in ("elec_saving_mae_kwh", "gas_saving_mae_kwh", "gas_saving_mean_true_kwh", "carbon_mae_kg", "improvement_pct_mae_pp",
                                                                              "baseline_constant_mae_pp", "improvement_rank_spearman", "baseline_rank_by_epc_rating_spearman", "improvement_nohp_rank_spearman")})
    R = M["relevance_model"]; inf = lambda s, k: R[s]["informative_measures_only"][k]
    tab("Retrofit relevance classifier (labels = a rule on SIMULATED savings, so this is re-learning a rule). Informative measures exclude near-constant heat pump / solar / boiler.",
        {"macro-F1": [inf(s, "macro_f1") for s in S], "  without monthly-shape features": [inf(s, "ablation_no_monthly_shape_macro_f1") for s in S],
         "  without any usage features": [inf(s, "ablation_no_usage_features_macro_f1") for s in S], "popularity baseline": [inf(s, "baseline_popularity_macro_f1") for s in S],
         "accuracy, all predictions": [R[s]["acc"] for s in S], "accuracy on the ~80% kept": [R[s]["with_abstention"]["acc"] for s in S], "coverage": [R[s]["with_abstention"]["coverage"] for s in S]})
    print("\nCalibration (train only):", M["calibration"]); print("Annualisation vs true:", M["annualisation_vs_true"]); print("Score by EPC band:", M["score_diagnostics"]["mean_score_by_epc_band"])
    try:
        L = json.load(open(C.REPORTS / "llm_eval.json")); print("\n################ C. EXPLANATION LAYER ################")
        print("template:", {k: round(x, 3) for k, x in L["template"].items()}, "| clean false positives:", L["false_positive_rate_on_clean_templates"])
        print("red-team (rendered text recall):", {k: round(x["recall"], 2) for k, x in L["red_team_rendered_text"].items()}); print("PS targets:", L["ps_targets"])
    except FileNotFoundError: print("\n(run `python -m greenhome.llm_eval` for the explanation-layer evaluation)")
    print(f"\n{M['notes']}\nrun time {M['runtime_s']}s")


if __name__ == "__main__":
    main()

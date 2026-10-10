"""Fit all models on `train`, evaluate on val / test / geo_test (unseen city) against baselines and the dataset's reference labels.
Writes models/*.joblib, reports/metrics.json, reports/test_predictions.parquet.        python -m greenhome.train

What the metrics do and do NOT show (also printed by `python -m greenhome.benchmark`):
 * INDEPENDENT evidence: engine vs the real EPC's own potential SAP / recommendations (`independent_epc_check`), value model vs real sales.
 * PARTLY CIRCULAR evidence: engine vs labels_* savings. The simulator that made those labels and our engine both use the catalogue's impact
   percentages and SCOP, so strong agreement is expected, not proof. The simulator additionally uses hidden per-home facts we never see.
 * The relevance model is scored against rule-based labels built from the same fields (re-learning a rule); the score itself is a documented formula, not a model."""
import json, time
import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from sklearn.metrics import mean_absolute_error as mae, r2_score, f1_score, accuracy_score, roc_auc_score, balanced_accuracy_score
import lightgbm as lgb
from . import config as C
from .features import build_master
from .scoring import score_df
from .models import EnergyModel, RelevanceModel, ValueModel, TRIVIAL_MEASURES, hpi_reference_price, save
from .retrofits import recommend, analyse_scenario, feasibility, monte_carlo

SPLITS = ("val", "test", "geo_test")
MC_HOMES, MC_DRAWS = 2000, 100


def mdape(y, p): return float(np.median(np.abs(y - p) / y) * 100)


def calibrate(s, epc_sets, lab_p, n_sap=4000, n_mc=1200):
    """Fit (on TRAIN homes only): (1) SAP_GAIN_SCALE so the engine's mean SAP gain for the EPC-recommended measures matches the EPC's own potential-SAP gain;
    (2) Monte Carlo widening factors so P10-P90 covers ~80% of reference savings. Written to models/calibration.json."""
    import json as _j
    rng = np.random.default_rng(0)
    d = s[(s.split == "train") & (s.usage_status == "metered") & (s.fuel_scope == "gas_elec")]
    C.SAP_GAIN_SCALE = 1.0; C.UNCERT_SCALE = {"elec": 1.0, "gas": 1.0, "imp": 1.0, "carbon": 1.0}
    ids = [pid for pid in d.property_id if pid in epc_sets and epc_sets[pid][0] and not epc_sets[pid][1]]
    samp = d[d.property_id.isin(rng.choice(ids, min(n_sap, len(ids)), replace=False))]; eng, epc = [], []
    for p in samp.to_dict("records"):
        x = analyse_scenario(p, p["elec_annual"], p["gas_annual"], list(epc_sets[p["property_id"]][0]))
        if x["selected"]: eng.append(x["sap_after"] - x["sap_before"]); epc.append(p["potential_sap"] - p["sap_score"])
    k = float(np.mean(epc) / np.mean(eng)); C.SAP_GAIN_SCALE = k
    rows = []
    for n_, p in enumerate(d.sample(min(n_mc, len(d)), random_state=1).to_dict("records")):
        e, g = p["elec_annual"], p["gas_annual"]; a = recommend(p, e, g)["package"]
        if not a["selected"]: continue
        mc = monte_carlo(p, e, g, a["selected"], n=MC_DRAWS, seed=10_000 + n_)["package"]; y = lab_p.loc[p["property_id"]]
        rows.append({"e": mc["elec"], "g": mc["gas"], "i": mc["improvement_pct"], "c": mc["carbon_kg"],
                     "ye": y.elec_saving_kwh, "yg": y.gas_saving_kwh, "yi": y.improvement_potential_pct, "yc": y.co2_saving_kg})
    def factor(key, ykey):
        lo, mid, hi = (np.array([r[key][j] for r in rows]) for j in range(3)); y = np.array([r[ykey] for r in rows], float); ok = ~np.isnan(y)
        for f in np.arange(1.0, 25.0, 0.25):
            if np.mean(((y >= mid - f * (mid - lo)) & (y <= mid + f * (hi - mid)))[ok]) >= 0.80: return float(f)
        return 25.0
    sc = {"elec": factor("e", "ye"), "gas": factor("g", "yg"), "imp": factor("i", "yi"), "carbon": factor("c", "yc")}
    C.UNCERT_SCALE = sc; C.CALIBRATED = True
    C.MODELS.mkdir(exist_ok=True); out = {"sap_gain_scale": k, "uncertainty_scale": sc, "n_sap_homes": len(eng), "n_mc_homes": len(rows), "fitted_on": "train split only"}
    (C.MODELS / "calibration.json").write_text(_j.dumps(out, indent=1)); return out


def train_relevance(df, lr, M):
    """Retrofit relevance classifier (High/Medium/Low per feasible measure) with metered-usage features, temperature-scaled probabilities and a
    'needs survey' abstention fitted on val. Also fits an ablation WITHOUT usage features (rm0), which is also the clean feature set for the EPC-recommendation model."""
    tr_, va_ = lr[lr.split == "train"], lr[lr.split == "val"]
    thermo = "setpoint_reported_c" in df.columns and bool(df["setpoint_reported_c"].notna().any())      # optional thermostat signal present in this dataset build
    rm = RelevanceModel(use_usage=True, use_thermo=thermo).fit(df, tr_).calibrate(df, va_, coverage=0.80); save(rm, "relevance_model")
    rm0 = RelevanceModel(use_usage=False).fit(df, tr_)
    rm1 = RelevanceModel(use_usage=True, use_twin=False, use_thermo=thermo).fit(df, tr_)      # ablation: annual usage but no monthly-shape features
    rm3 = RelevanceModel(use_usage=True, use_thermo=False).fit(df, tr_) if thermo else None   # ablation: without the thermostat signal
    pop = tr_.groupby("retrofit_id").relevance.agg(lambda z: z.value_counts().idxmax()); cls = np.array(rm.CLASSES)
    M["relevance_model"] = {"temperature": rm.T, "abstain_threshold": rm.abstain_threshold, "target_coverage_on_val": 0.80}
    for sp in SPLITS:
        d = lr[lr.split == sp].reset_index(drop=True); pr = rm.predict_proba(df, d); k, conf, ns = rm.decide(pr); pred = cls[k]; ok = pred == d.relevance.values
        inf = ~d.retrofit_id.isin(TRIVIAL_MEASURES).values; keep = ~ns
        p0 = cls[rm0.predict_proba(df, d).argmax(1)]; p1 = cls[rm1.predict_proba(df, d).argmax(1)]; p3 = cls[rm3.predict_proba(df, d).argmax(1)] if thermo else None; ppop = d.retrofit_id.map(pop).values
        per = {r_: {"n": int(len(z)), "acc": round(float((pred[z.index] == z.relevance.values).mean()), 3),
                    "majority_acc": round(float(z.relevance.value_counts(normalize=True).iloc[0]), 3)} for r_, z in d.groupby("retrofit_id")}
        curve = {}
        for q in (0.0, 0.1, 0.2, 0.3):
            kq = conf >= np.quantile(conf, q); curve[f"abstain_{int(q * 100)}pct"] = {"coverage": float(kq.mean()), "acc": float(ok[kq].mean()),
                                                                                        "acc_informative": float(ok[kq & inf].mean())}
        M["relevance_model"][sp] = {
            "n": len(d), "acc": float(ok.mean()), "macro_f1": f1_score(d.relevance, pred, average="macro"),
            "informative_measures_only": {"n": int(inf.sum()), "acc": float(ok[inf].mean()), "macro_f1": f1_score(d.relevance[inf], pred[inf], average="macro"),
                                          "balanced_acc": balanced_accuracy_score(d.relevance[inf], pred[inf]),
                                          "baseline_popularity_macro_f1": f1_score(d.relevance[inf], ppop[inf], average="macro"),
                                          "ablation_no_usage_features_macro_f1": f1_score(d.relevance[inf], p0[inf], average="macro"),
                                          "ablation_no_monthly_shape_macro_f1": f1_score(d.relevance[inf], p1[inf], average="macro"),
                                          "ablation_no_thermostat_signal_macro_f1": f1_score(d.relevance[inf], p3[inf], average="macro") if thermo else None},
            "baseline_popularity_macro_f1": f1_score(d.relevance, ppop, average="macro"), "baseline_popularity_acc": accuracy_score(d.relevance, ppop),
            "ablation_no_usage_features": {"acc": accuracy_score(d.relevance, p0), "macro_f1": f1_score(d.relevance, p0, average="macro")},
            "ablation_no_monthly_shape": {"acc": accuracy_score(d.relevance, p1), "macro_f1": f1_score(d.relevance, p1, average="macro")},
            "per_measure": per,
            "with_abstention": {"coverage": float(keep.mean()), "acc": float(ok[keep].mean()), "acc_informative": float(ok[keep & inf].mean()),
                                "n_needs_survey": int(ns.sum())},
            "coverage_curve": curve}
    M["relevance_model"]["note"] = ("Relevance = size of the saving (High >=10% of energy, Medium >=3%), a rule applied to SIMULATED savings, so this measures re-learning a rule from visible "
                                    "features, not agreement with real assessors. Heat pump, solar and boiler are near-constant classes, so the headline numbers are 'informative_measures_only'. "
                                    "The ceiling is set by hidden simulator state (thermostat setting, 'assumed' walls that are really insulated); metered-usage features recover part of it, and the monthly-shape features (per-home slope of use against heating degree days, base load, winter/summer ratio) recover more because they reflect the home's true heat-loss response. "
                                    "'with_abstention' keeps the ~80% most confident predictions (threshold fitted on val) and returns 'needs survey' for the rest. "
                                    "It does NOT predict what the EPC recommends (that is the model below).")
    return rm, rm0


def main():
    t0 = time.time(); M = {"notes": "Targets are simulator / real-EPC / real-sales references. Agreement with simulated labels does not prove real-world accuracy; see the module docstring for which checks are independent and which are partly circular."}
    df = build_master(refresh=True); s = score_df(df)
    M["n_homes"] = {k: int(v) for k, v in df.split.value_counts().items()}
    tr = s[s.split == "train"]

    m = s[s.intensity.notna()]
    M["score_diagnostics"] = {"class_counts": s.classification.value_counts().to_dict(),
                              "corr_sap_vs_metered_intensity": float(np.corrcoef(m.sap_score, m.intensity)[0, 1]),
                              "corr_sap_vs_epc_modelled_intensity": float(np.corrcoef(m.sap_score, m.epc_primary_kwh_m2 / 1.0)[0, 1]),
                              "mean_score_by_epc_band": s.groupby("energy_rating").score.mean().round(1).to_dict()}

    print(f"[{time.time() - t0:5.0f}s] energy models", flush=True)
    # ---- 2 energy models (homes without usable meter data) vs NEED-style median by type x area band
    em = EnergyModel().fit(tr); save(em, "energy_model"); M["energy_model"] = {}
    eml = EnergyModel(lean=True).fit(tr); save(eml, "energy_model_lean"); M["energy_model_lean_customer_inputs_only"] = {}
    band = lambda d: pd.cut(d.floor_area, [0, 50, 70, 90, 120, 1e9], labels=False)
    t = tr[tr.usage_status == "metered"].assign(b=lambda x: band(x))
    med = t.groupby(["property_type", "b"], observed=True)[["elec_annual", "gas_annual"]].median()
    for sp in SPLITS:
        d = s[(s.split == sp) & (s.usage_status == "metered")]; pe, pg = em.predict(d)
        k = pd.MultiIndex.from_arrays([d.property_type, band(d)]); be = med.reindex(k)["elec_annual"].values; bg = med.reindex(k)["gas_annual"].values; ok = ~np.isnan(be)
        M["energy_model"][sp] = {"n": len(d), "elec_mae": mae(d.elec_annual, pe), "elec_baseline_mae": mae(d.elec_annual[ok], be[ok]),
                                 "gas_mae": mae(d.gas_annual, pg), "gas_baseline_mae": mae(d.gas_annual[ok], bg[ok]),
                                 "gas_r2": r2_score(d.gas_annual, pg), "elec_r2": r2_score(d.elec_annual, pe)}
        ple, plg = eml.predict(d)
        M["energy_model_lean_customer_inputs_only"][sp] = {"n": len(d), "elec_mae": mae(d.elec_annual, ple), "elec_baseline_mae": mae(d.elec_annual[ok], be[ok]),
                                                           "gas_mae": mae(d.gas_annual, plg), "gas_baseline_mae": mae(d.gas_annual[ok], bg[ok]), "gas_r2": r2_score(d.gas_annual, plg)}
    lp = pd.read_parquet(C.DATA / "labels_package.parquet"); x = df[(df.usage_status == "metered") & (df.fuel_scope == "gas_elec")].merge(lp, on="property_id")
    M["annualisation_vs_true"] = {"elec_median_ape_pct": mdape(x.elec_import_before_kwh[x.elec_import_before_kwh > 200], x.elec_annual[x.elec_import_before_kwh > 200]),
                                  "gas_median_ape_pct": mdape(x.gas_before_kwh[x.gas_before_kwh > 200], x.gas_annual[x.gas_before_kwh > 200]),
                                  "homes_unavailable": int((df.usage_status == "unavailable").sum())}

    print(f"[{time.time() - t0:5.0f}s] relevance + EPC-recommendation models", flush=True)
    # ---- 3 retrofit relevance (rule-based labels from the same fields: partly circular) + EPC-recommendation model (real label)
    lr = pd.read_parquet(C.DATA / "labels_retrofit.parquet"); lr = lr[lr.feasible].merge(df[["property_id", "split"]], on="property_id")
    rm, rm0 = train_relevance(df, lr, M)
    Xe = rm0._X(df, lr[lr.split == "train"]); ye = lr[lr.split == "train"].epc_recommended.astype(int).values
    epc_m = lgb.LGBMClassifier(n_estimators=250, learning_rate=0.08, num_leaves=63, min_child_samples=30, subsample=0.8, subsample_freq=1, colsample_bytree=0.8,
                               verbose=-1, n_jobs=-1, random_state=42, deterministic=True, force_row_wise=True).fit(Xe, ye); save(epc_m, "epc_rec_model"); M["epc_recommendation_model"] = {}
    for sp in SPLITS:
        d = lr[lr.split == sp]; pr = epc_m.predict_proba(rm0._X(df, d))[:, 1]; per = {}
        for r_, z in d.assign(p=pr).groupby("retrofit_id"):
            y_ = z.epc_recommended.astype(int); br = float(y_.mean())
            per[r_] = {"n": int(len(z)), "base_rate": round(br, 3), "auc": round(float(roc_auc_score(y_, z.p)), 3) if y_.nunique() > 1 else None,
                       "informative": bool(len(z) >= 200 and 0.05 <= br <= 0.95)}
        M["epc_recommendation_model"][sp] = per
    M["epc_recommendation_model"]["note"] = ("Real label (RdSAP software output) but RdSAP is rule-based on the same fields, and several measures are near-always (base rate >0.95) or near-never "
                                              "recommended, so only rows with informative=true are meaningful. Pooled AUC is deliberately not reported (it is inflated by measure identity).")

    print(f"[{time.time() - t0:5.0f}s] value models (train-only and production)", flush=True)
    # ---- 4 value model: evaluation fit = train only; production fit (saved as value_model, used by the app) = train + val
    sales = pd.read_parquet(C.DATA / "sales_history.parquet"); lat = sales.sort_values("date").groupby("property_id").tail(1)
    lat = lat[(lat.new_build != "Y") & lat.price_indexed_valuation.notna()][["property_id", "price_indexed_valuation"]]
    sh = s.merge(lat, on="property_id")
    rated = s.merge(sales[(sales.energy_rating_at_sale != "unknown") & (sales.new_build != "Y")][["property_id", "price_indexed_valuation"]], on="property_id")
    vm = ValueModel().set_centroids(df).fit(sh[sh.split == "train"], rated[rated.split == "train"]); save(vm, "value_model_trainonly")
    vp = ValueModel().set_centroids(df).fit(sh[sh.split.isin(["train", "val"])], rated[rated.split.isin(["train", "val"])]); save(vp, "value_model")
    base = sh[sh.split == "train"].assign(pm2=lambda z: z.price_indexed_valuation / z.floor_area)
    po, pn = base.groupby("outcode", observed=True).pm2.median(), base.pm2.median()
    M["value_model"] = {"rating_premium_trainonly": vm.premium_summary(), "rating_premium_production_train_plus_val": vp.premium_summary(),
                        "dataset_reference_premium_DATA_md": "4.2% per 10 SAP (95% CI 3.1-5.3), fitted on ALL 5,187 rated sales incl. held-out homes"}
    for sp in SPLITS:
        d = sh[sh.split == sp]; pr = vm.price(d); b = d.outcode.astype(str).map(po.rename(index=str)).fillna(pn).astype(float) * d.floor_area
        y = d.price_indexed_valuation.values; scale = np.median(y / pr)
        M["value_model"][sp] = {"n": len(d), "median_ape_pct": mdape(y, pr), "baseline_outcode_pm2_median_ape_pct": mdape(y, b), "baseline_hpi_council_type_average_median_ape_pct": mdape(y, hpi_reference_price(d)), "bias_pct": float(np.mean(pr / y - 1) * 100),
                                "within_split_rank_spearman": float(spearmanr(pr, y)[0]), "level_corrected_median_ape_pct": mdape(y, pr * scale)}
    M["value_model"]["note"] = ("Price LEVEL model: predicts log price RELATIVE to the council's public UK HPI average for the home type (July 2026, greenhome/reference/council_hpi_2026-07.csv), "
                                "from size, type, age and location relative to the council centre. Without that market-level anchor, home features alone could not tell the model that Liverpool is cheaper "
                                "than every training city (median error 48%, ranking near random); with it, error on the unseen city is much lower but still higher than in known cities, so treat the level "
                                "as indicative. HPI values are council averages, not data about any held-out home. The product uses the model for the RELATIVE rating premium; the baseline value is the "
                                "dataset's current_value_estimate. The rating premium is itself heterogeneous: see premium_by_council_train and heldout_premium_check. The dataset's 4.2% is fitted on all sales "
                                "including Liverpool/Cardiff, which have higher premiums than the training councils, hence our lower train-only estimate; the range includes a council-level cluster bootstrap to reflect this.")

    def prem_est(z):   # premium per 10 SAP points: log price ~ type + log area + SAP (no location FE so it is comparable for unseen councils)
        z = z.dropna(subset=["price_indexed_valuation"])
        X_ = pd.get_dummies(z[["property_type"]].astype(str), drop_first=True).astype(float); X_["la"] = np.log(z.floor_area.astype(float)); X_["sap"] = z.sap_score.astype(float); X_["c"] = 1.0
        return round(100 * (np.exp(10 * np.linalg.lstsq(X_.values, np.log(z.price_indexed_valuation.values), rcond=None)[0][list(X_.columns).index("sap")]) - 1), 2)
    M["value_model"]["premium_by_council_train"] = {str(la): {"n": int(len(z)), "pct_per_10_sap": prem_est(z)} for la, z in rated[rated.split == "train"].groupby("local_authority", observed=True) if len(z) >= 250}
    lo_, hi_ = vm.premium_summary()["ci95_pct_per_10_sap"]
    M["value_model"]["heldout_premium_check"] = {sp: {"n_rated_sales": int((rated.split == sp).sum()), "premium_pct_per_10_sap": prem_est(rated[rated.split == sp]),
                                                      "inside_our_train_only_range": bool(lo_ <= prem_est(rated[rated.split == sp]) <= hi_)} for sp in SPLITS}
    M["value_model"]["heldout_premium_check"]["note"] = ("INDEPENDENT test of the value range: does the premium actually observed in each held-out set (real sales) fall inside the range fitted on train only? "
                                                         "The dataset-label midpoint is not used as ground truth because it was fitted on all sales including these held-out ones.")

    print(f"[{time.time() - t0:5.0f}s] calibration", flush=True)
    # ---- 4b calibration on TRAIN homes only (then everything below is evaluated on held-out splits)
    lab_p = pd.read_parquet(C.DATA / "labels_package.parquet").set_index("property_id")
    er = pd.read_parquet(C.DATA / "epc_recommendations.parquet")
    epc_sets = {pid: (set(z.mapped_retrofit.dropna()), z.mapped_retrofit.isna().any()) for pid, z in er.groupby("property_id")}
    cal = calibrate(s, epc_sets, lab_p); M["calibration"] = cal
    print(f"[{time.time() - t0:5.0f}s] engine evaluation", flush=True)
    # ---- 5 engine vs reference labels + independent EPC checks + Monte Carlo coverage
    lab_v = pd.read_parquet(C.DATA / "labels_value.parquet").set_index("property_id")
    lab_r = pd.read_parquet(C.DATA / "labels_retrofit.parquet"); lab_r = lab_r[lab_r.feasible].set_index(["property_id", "retrofit_id"])
    M["engine_vs_reference"] = {}; M["per_measure_alone"] = {}; M["independent_epc_check"] = {}; M["monte_carlo_coverage"] = {}; preds = []
    for sp in SPLITS:
        d = s[(s.split == sp) & (s.usage_status == "metered") & (s.fuel_scope == "gas_elec")]
        recs, alone, ind = [], [], []
        print(f"[{sp}] engine over {len(d):,} homes", flush=True)
        for n_, p in enumerate(d.to_dict("records")):
            if n_ % 5000 == 0: print(f"  {n_:,}/{len(d):,}  ({time.time() - t0:.0f}s)", flush=True)
            e, g = p["elec_annual"], p["gas_annual"]; r = recommend(p, e, g); a = r["package"]; pid = p["property_id"]
            row = {"property_id": pid, "split": sp, "score": p["score"], "classification": p["classification"], "d_elec": a["saving"]["elec"], "d_gas": a["saving"]["gas"],
                   "carbon_kg": a["carbon_saving_kg"], "impr": a["improvement_potential_pct"], "impr_nohp": r["package_no_hp"]["improvement_potential_pct"],
                   "sap_before": a["sap_before"], "sap_after": a["sap_after"], "rating_after": a["rating_after"], "measures": "+".join(a["selected"]), "package_cost_gbp": a["cost_gbp"]}
            if n_ < MC_HOMES and a["selected"]:
                mc = monte_carlo(p, e, g, a["selected"], n=MC_DRAWS, seed=n_)["package"]
                row.update(mc_e10=mc["elec"][0], mc_e90=mc["elec"][2], mc_g10=mc["gas"][0], mc_g90=mc["gas"][2], mc_i10=mc["improvement_pct"][0], mc_i90=mc["improvement_pct"][2],
                           mc_c10=mc["carbon_kg"][0], mc_c90=mc["carbon_kg"][2])
            recs.append(row)
            for k, (ok_, _) in feasibility(p).items():
                if ok_:
                    x1 = analyse_scenario(p, e, g, [k]); alone.append((pid, k, x1["saving"]["elec"], x1["saving"]["gas"]))
            es = epc_sets.get(pid)       # INDEPENDENT: apply exactly the measures the real EPC recommended (all mappable to our nine) and compare SAP gain
            if es and es[0] and not es[1]:
                x2 = analyse_scenario(p, e, g, list(es[0]))
                if x2["selected"]: ind.append({"eng_dsap": x2["sap_after"] - x2["sap_before"], "epc_dsap": p["potential_sap"] - p["sap_score"], "n_measures": len(x2["selected"])})
        R = pd.DataFrame(recs)
        up = vm.uplift_batch(d.reset_index(drop=True), R.sap_after.values)
        R["uplift_low"], R["uplift_mid"], R["uplift_high"] = up.low_pct.values, up.mid_pct.values, up.high_pct.values
        R = R.join(lab_p, on="property_id").join(lab_v[["uplift_pct_low", "uplift_pct_mid", "uplift_pct_high", "sap_after"]].rename(columns={"sap_after": "ref_sap_after"}), on="property_id")
        R = R.join(d.set_index("property_id")[["potential_sap", "sap_score"]], on="property_id")
        k1 = R.dropna(subset=["impr", "improvement_potential_pct"]); k2 = R.dropna(subset=["impr_nohp", "improvement_potential_pct_no_heat_pump"])
        M["engine_vs_reference"][sp] = {
            "n": len(R), "elec_saving_mae_kwh": mae(R.elec_saving_kwh, R.d_elec), "gas_saving_mae_kwh": mae(R.gas_saving_kwh, R.d_gas),
            "gas_saving_mean_true_kwh": float(R.gas_saving_kwh.mean()), "elec_saving_mean_true_kwh": float(R.elec_saving_kwh.mean()),
            "carbon_mae_kg": mae(R.co2_saving_kg, R.carbon_kg), "carbon_mean_true_kg": float(R.co2_saving_kg.mean()),
            "improvement_pct_mae_pp": mae(k1.improvement_potential_pct, k1.impr), "improvement_rank_spearman": float(spearmanr(k1.impr, k1.improvement_potential_pct)[0]),
            "improvement_nohp_rank_spearman": float(spearmanr(k2.impr_nohp, k2.improvement_potential_pct_no_heat_pump)[0]),
            "baseline_rank_by_epc_rating_spearman": float(spearmanr(-k1.sap_score, k1.improvement_potential_pct)[0]),
            "baseline_constant_mae_pp": mae(k1.improvement_potential_pct, np.full(len(k1), df[df.split == 'train'].merge(lab_p, on='property_id').improvement_potential_pct.mean())),
            "vs_epc_potential_improvement_spearman": float(spearmanr(k2.impr_nohp, k2.epc_potential_improvement_pct, nan_policy="omit")[0]),
            "engine_dSAP_mean": float((R.sap_after - R.sap_before).mean()), "epc_dSAP_mean": float((R.potential_sap - R.sap_score).mean()),
            "engine_vs_epc_dSAP_corr": float(np.corrcoef(R.sap_after - R.sap_before, R.potential_sap - R.sap_score)[0, 1]),
            "uplift_mid_mae_pp_vs_label": mae(R.uplift_pct_mid.fillna(0), R.uplift_mid.fillna(0)),
            "uplift_label_mid_inside_range": float(np.mean((R.uplift_pct_mid >= R.uplift_low.fillna(0) - 0.05) & (R.uplift_pct_mid <= R.uplift_high.fillna(0) + 0.05)))}
        I = pd.DataFrame(ind)
        M["independent_epc_check"][sp] = {"n_homes": len(I), "engine_dSAP_mean": float(I.eng_dsap.mean()), "epc_dSAP_mean": float(I.epc_dsap.mean()),
                                          "dSAP_corr": float(np.corrcoef(I.eng_dsap, I.epc_dsap)[0, 1]), "dSAP_mae": mae(I.epc_dsap, I.eng_dsap),
                                          "dSAP_spearman": float(spearmanr(I.eng_dsap, I.epc_dsap)[0])}
        Q = R.dropna(subset=["mc_e10"])
        cov = lambda lo, hi, y: float(((Q[y] >= Q[lo]) & (Q[y] <= Q[hi])).mean())
        M["monte_carlo_coverage"][sp] = {"n": len(Q), "target_P10_P90": 0.80, "elec_saving": cov("mc_e10", "mc_e90", "elec_saving_kwh"), "gas_saving": cov("mc_g10", "mc_g90", "gas_saving_kwh"),
                                         "improvement_pct": cov("mc_i10", "mc_i90", "improvement_potential_pct"), "carbon": cov("mc_c10", "mc_c90", "co2_saving_kg"),
                                         "median_gas_band_width_pct_of_true": float(np.median((Q.mc_g90 - Q.mc_g10) / Q.gas_saving_kwh.replace(0, np.nan)) * 100)}
        al = pd.DataFrame(alone, columns=["property_id", "retrofit_id", "e", "g"]).join(lab_r, on=["property_id", "retrofit_id"], how="inner")
        M["per_measure_alone"][sp] = al.groupby("retrofit_id").apply(lambda z: pd.Series({
            "n": len(z), "gas_mae_kwh": (z.g - z.gas_saving_kwh).abs().mean(), "gas_true_mean_kwh": z.gas_saving_kwh.mean(),
            "elec_mae_kwh": (z.e - z.elec_saving_kwh).abs().mean(), "elec_true_mean_kwh": z.elec_saving_kwh.mean()})).round(1).to_dict("index")
        preds.append(R)
    C.REPORTS.mkdir(exist_ok=True)
    pd.concat(preds)[lambda z: z.split.isin(["test", "geo_test"])].to_parquet(C.REPORTS / "test_predictions.parquet")
    M["runtime_s"] = round(time.time() - t0)
    json.dump(M, open(C.REPORTS / "metrics.json", "w"), indent=1, default=float)
    print("done", M["runtime_s"], "s")


if __name__ == "__main__":
    main()

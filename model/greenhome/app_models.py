"""Models for homes entered in the app, and the customer-path evaluation.

1 SapModel           LightGBM estimate of the SAP score from what the app collects, with a P10-P90 range (quantile models, widened on
                     `val` to ~80% coverage). Used only when the user doesn't know their EPC rating, and always as a cross-check.
2 app relevance      the retrofit relevance classifier refitted on app inputs (`app_view`), half the rows without monthly readings,
                     abstention threshold set on app-path `val`.
Both are fitted on `train`; everything is reported on val / test / geo_test exactly as the app would see those homes.
    python -m greenhome.app_models          (also run at the end of python -m greenhome.train)"""
import json, time
import numpy as np
import pandas as pd
import lightgbm as lgb
from sklearn.metrics import accuracy_score, f1_score
from . import config as C
from .features import build_master, TWIN_COLS
from .models import RelevanceModel, TRIVIAL_MEASURES, save, load
from .custom import cost_reference
from .scoring import score_df
from .app_input import app_view, homeowner_noise

SPLITS = ("val", "test", "geo_test")
SAP_CAT = ["property_type", "built_form", "wall_type", "roof_type", "roof_insulation", "floor_type", "floor_insulation", "heating_detail", "climate_region"]
SAP_NUM = ["age_year_est", "floor_area", "habitable_rooms", "wall_insulation_level", "loft_mm", "glazing_level", "controls_level", "solar_kwp_est",
           "storeys_est", "floor_level", "lat", "lon", "intensity", "elec_annual", "gas_annual"]
BANDS = list("ABCDEFG")


def band_of(sap):
    s = np.asarray(sap, float)
    return np.select([s >= 92, s >= 81, s >= 69, s >= 55, s >= 39, s >= 21], BANDS[:6], "G")


class SapModel:
    def _X(self, df):
        X = pd.DataFrame({c: pd.Categorical(df[c].astype(str), categories=self.cats[c]) for c in SAP_CAT}, index=df.index)
        for c in SAP_NUM: X[c] = df[c].astype(float)
        X["boiler_condensing"] = df.boiler_condensing.map({True: 1.0, False: 0.0}).astype(float)
        return X

    def fit(self, df):
        self.cats = {c: sorted(df[c].astype(str).unique()) for c in SAP_CAT}
        X, y = self._X(df), df.sap_score.clip(1, 100).astype(float)
        kw = dict(n_estimators=600, learning_rate=0.05, num_leaves=63, min_child_samples=30, subsample=0.8, subsample_freq=1, colsample_bytree=0.8,
                  verbose=-1, n_jobs=-1, random_state=42, deterministic=True, force_row_wise=True)
        self.m = lgb.LGBMRegressor(**kw).fit(X, y)
        self.lo = lgb.LGBMRegressor(objective="quantile", alpha=0.1, **kw).fit(X, y)
        self.hi = lgb.LGBMRegressor(objective="quantile", alpha=0.9, **kw).fit(X, y)
        self.widen = 1.0
        return self

    def predict(self, df):
        """-> (estimate, P10, P90) SAP, the range widened by the factor fitted on val."""
        X = self._X(df); p = self.m.predict(X); lo, hi = self.lo.predict(X), self.hi.predict(X)
        lo, hi = p - self.widen * np.maximum(p - lo, 0), p + self.widen * np.maximum(hi - p, 0)
        return np.clip(p, 1, 100), np.clip(lo, 1, 100), np.clip(hi, 1, 100)

    def calibrate(self, df, coverage=0.80):
        y = df.sap_score.clip(1, 100).astype(float).values
        for f in np.arange(1.0, 4.0, 0.05):
            self.widen = float(f); _, lo, hi = self.predict(df)
            if np.mean((y >= lo) & (y <= hi)) >= coverage: break
        return self


def _sap_metrics(sm, a, y):
    p, lo, hi = sm.predict(a)
    tb, pb = band_of(y), band_of(p)
    idx = {b: i for i, b in enumerate(BANDS)}
    return {"n": len(y), "mae_sap": float(np.mean(np.abs(p - y))), "bias_sap": float(np.mean(p - y)),
            "band_accuracy": float(accuracy_score(tb, pb)), "band_macro_f1_B_to_F": float(f1_score(tb, pb, average="macro", labels=BANDS[1:6])),
            "band_within_one": float(np.mean(np.abs(np.vectorize(idx.get)(tb) - np.vectorize(idx.get)(pb)) <= 1)),
            "p10_p90_coverage": float(np.mean((y >= lo) & (y <= hi))), "median_range_width": float(np.median(hi - lo))}


def _score_effect(a, y, p):
    """Green Home Score with the estimated SAP vs the same home with its recorded SAP (everything else as the app collects it)."""
    t, e = score_df(a.assign(sap_score=y)), score_df(a.assign(sap_score=p))
    return {"score_mae": float(np.mean(np.abs(e.score.values - t.score.values))), "same_class": float(np.mean(e.classification.values == t.classification.values))}


def _relevance_metrics(rel, a, lab):
    cls = np.array(rel.CLASSES); pr = rel.predict_proba(a, lab); yh = cls[pr.argmax(1)]; yt = lab.relevance.values
    inf = ~lab.retrofit_id.isin(TRIVIAL_MEASURES).values; keep = pr.max(1) >= rel.abstain_threshold
    return {"n": int(len(yt)), "accuracy": float(accuracy_score(yt, yh)), "macro_f1": float(f1_score(yt, yh, average="macro")),
            "accuracy_informative": float(accuracy_score(yt[inf], yh[inf])), "macro_f1_informative": float(f1_score(yt[inf], yh[inf], average="macro")),
            "answered": float(keep.mean()), "accuracy_when_answered": float(accuracy_score(yt[keep], yh[keep]))}


def main(df: pd.DataFrame = None, M: dict = None):
    t0 = time.time(); standalone = M is None; M = {} if M is None else M
    df = build_master() if df is None else df
    df = df[df.property_type.astype(str) != "Park home"].reset_index(drop=True)
    usage = pd.read_parquet(C.DATA / "energy_usage.parquet"); ref = cost_reference(df)
    monthly, annual = app_view(df, usage, ref, monthly=True), app_view(df, usage, ref, monthly=False)
    y = df.sap_score.clip(1, 100).astype(float).values
    split = df.split.values
    print(f"[{time.time() - t0:5.0f}s] app views built", flush=True)

    # ---- SAP estimator: fit on train (bill totals, the more common case), range widened on val with homeowner noise
    sm = SapModel().fit(annual[split == "train"])
    sm.calibrate(homeowner_noise(annual[split == "val"], seed=1)); save(sm, "sap_model")
    R = {"widen": sm.widen, "note": "SAP estimated from the app's questions only; used for 'I don't know my EPC rating' and as a cross-check."}
    for sp in SPLITS:
        k = split == sp
        R[sp] = {}
        for name, a in (("bill_totals", annual[k]), ("monthly_readings", monthly[k]), ("bill_totals_homeowner_noise", homeowner_noise(annual[k], seed=2))):
            r = _sap_metrics(sm, a, y[k]); r.update(_score_effect(a, y[k], sm.predict(a)[0])); R[sp][name] = r
        b = df[split == "train"].assign(y=y[split == "train"]).groupby(["property_type", "age_band"], observed=True).y.median()
        bp = b.reindex(pd.MultiIndex.from_arrays([df.property_type[k], df.age_band[k]])).values
        R[sp]["baseline_type_x_age_median_mae_sap"] = float(np.nanmean(np.abs(bp - y[k])))
    M["sap_estimator"] = R
    print(f"[{time.time() - t0:5.0f}s] SAP estimator", flush=True)

    # ---- relevance on app inputs: train with recorded SAP; evaluate with the estimated SAP (worst case: nobody knows their rating)
    lr = pd.read_parquet(C.DATA / "labels_retrofit.parquet"); lr = lr[lr.feasible].merge(df[["property_id", "split"]], on="property_id")
    # trained on homeowner-noise inputs; half the homes as if they gave bill totals only (no monthly shape); usage always present
    rel = RelevanceModel(use_usage=True, use_twin=True, use_thermo=False).fit(homeowner_noise(monthly[split == "train"], seed=4), lr[lr.split == "train"],
                                                                              masks={"usage": 0.0, "twin": 0.5, "epc": 0.0})
    est = lambda a: a.assign(sap_score=sm.predict(a)[0])
    va = homeowner_noise(monthly[split == "val"], seed=5)
    va.loc[np.random.default_rng(6).random(len(va)) < 0.5, TWIN_COLS] = np.nan        # the same monthly / bills-only mix for the "needs survey" cut-off
    rel.calibrate(est(va), lr[lr.split == "val"], coverage=0.80); save(rel, "relevance_model_app")
    base = load("relevance_model")
    Rr = {"abstain_threshold": rel.abstain_threshold, "temperature": rel.T}
    for sp in SPLITS:
        k = split == sp; lab = lr[lr.split == sp]
        Rr[sp] = {"dataset_inputs_dataset_model": _relevance_metrics(base, df, lab),
                  "app_monthly_readings": _relevance_metrics(rel, est(homeowner_noise(monthly[k], seed=3)), lab),
                  "app_bill_totals": _relevance_metrics(rel, est(homeowner_noise(annual[k], seed=3)), lab),
                  "app_bill_totals_dataset_model": _relevance_metrics(base, est(homeowner_noise(annual[k], seed=3)), lab)}
    M["relevance_app"] = Rr
    M["app_path_note"] = ("Customer path: every held-out home is reduced to exactly what the app collects (answer categories, the last 12 monthly "
                          "readings or a raw 12-month bill, no EPC-modelled figures), with a documented homeowner-error model "
                          "(app_input.homeowner_noise) and the SAP estimate in place of the recorded rating. These are the numbers an app user gets.")
    print(f"[{time.time() - t0:5.0f}s] app relevance model", flush=True)
    if standalone:
        C.REPORTS.mkdir(exist_ok=True); (C.REPORTS / "app_metrics.json").write_text(json.dumps(M, indent=1, default=float))
    return M


if __name__ == "__main__":
    from greenhome import app_models          # run through the package so saved models unpickle as greenhome.app_models.SapModel
    M = app_models.main()
    for sp in SPLITS:
        s = M["sap_estimator"][sp]["bill_totals_homeowner_noise"]; r = M["relevance_app"][sp]
        print(f"{sp:9} SAP mae {s['mae_sap']:.2f} band acc {s['band_accuracy']:.3f} f1 {s['band_macro_f1_B_to_F']:.3f} cover {s['p10_p90_coverage']:.3f} "
              f"score mae {s['score_mae']:.2f} same class {s['same_class']:.3f} | relevance acc monthly {r['app_monthly_readings']['accuracy']:.3f} "
              f"f1 {r['app_monthly_readings']['macro_f1']:.3f} · bills {r['app_bill_totals']['accuracy']:.3f} f1 {r['app_bill_totals']['macro_f1']:.3f} "
              f"answered {r['app_bill_totals']['answered']:.2f}")

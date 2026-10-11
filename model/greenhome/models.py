"""ML components (all fitted on `train` only; reported on val / test / geo_test = unseen city).
 1 EnergyModel    LightGBM predicting annualised grid-electricity and gas for homes WITHOUT usable meter data (flagged 'modelled').
 2 RelevanceModel LightGBM multiclass: High/Medium/Low relevance of each feasible retrofit (retrofit recommender).
 3 ValueModel     bootstrap ensemble of monotone-in-SAP LightGBMs on real sales (HPI-indexed); uplift = predicted price at
                  post-retrofit SAP / predicted price at current SAP, everything else held fixed. Range = 10th-90th percentile."""
import joblib
import numpy as np
import pandas as pd
import lightgbm as lgb
from pathlib import Path
from . import config as C
from .features import TWIN_COLS

THERMO = ["setpoint_reported_c"]       # optional, partial, noisy report of the usual heating temperature (NaN for most homes); absent in older datasets

CAT_COLS = ["property_type", "built_form", "age_band", "wall_type", "roof_type", "floor_type", "heating_detail",
            "climate_region", "roof_insulation", "floor_insulation"]
NUM_COLS = ["floor_area", "habitable_rooms", "age_year_est", "floor_level", "storeys_est", "sap_score", "epc_primary_kwh_m2",
            "epc_co2_t", "epc_heating_cost_current", "epc_hot_water_cost_current", "epc_lighting_cost_current",
            "wall_insulation_level", "loft_mm", "glazing_level", "controls_level", "solar_kwp_est", "photo_supply_pct",
            "low_energy_lighting_pct", "lat", "lon"]
BOOL_COLS = ["boiler_condensing", "has_solar_pv", "mains_gas_flag", "hot_water_offpeak"]
# value columns, labels and true usage are deliberately NOT features anywhere here (leakage traps in docs.md)


SEED = 42


def _lgb(n_estimators=400, **kw):
    return lgb.LGBMRegressor(n_estimators=n_estimators, learning_rate=0.05, num_leaves=31, min_child_samples=30, subsample=0.8,
                             subsample_freq=1, colsample_bytree=0.8, verbose=-1, n_jobs=-1, random_state=SEED, deterministic=True, force_row_wise=True, **kw)


def _booster_predict(model, X: pd.DataFrame) -> np.ndarray:
    """Same numbers as model.predict / predict_proba: LightGBM's own pandas conversion (category codes, missing -> NaN, float64) done here,
    skipping the sklearn wrapper's per-call checks, which cost ~3 ms for a single home. Small batches run on one thread."""
    M = np.column_stack([np.where(X[c].cat.codes.to_numpy() < 0, np.nan, X[c].cat.codes.to_numpy()).astype(float) if isinstance(X[c].dtype, pd.CategoricalDtype)
                         else X[c].to_numpy(dtype=float) for c in X.columns])
    return model.booster_.predict(M, num_threads=1) if len(M) < 1000 else model.booster_.predict(M)


class Design:
    """Stable feature matrix: fixed category levels, NaN kept as missing."""
    def fit(self, df):
        self.cats = {c: sorted(df[c].astype(str).unique()) for c in CAT_COLS}; return self

    def __call__(self, df, extra_cat=None):
        X = {}                                       # built in one go: a column-by-column DataFrame costs more than the model itself for one home
        for c in CAT_COLS:
            X[c] = pd.Categorical(df[c].astype(str), categories=self.cats[c])
        for c in NUM_COLS:
            X[c] = df[c].astype(float).to_numpy()
        for c in BOOL_COLS:
            X[c] = (df[c].map({True: 1.0, False: 0.0}).astype(float) if df[c].dtype == object else df[c].astype(float)).to_numpy()
        return pd.DataFrame(X, index=df.index)


EPC_MODELLED = ["epc_primary_kwh_m2", "epc_co2_t", "epc_heating_cost_current", "epc_hot_water_cost_current", "epc_lighting_cost_current"]


class EnergyModel:
    """Annual grid electricity and gas from property features. `lean=True` drops EPC-modelled fields (primary energy, CO2, EPC costs)
    that a customer typing in their own home cannot know."""
    def __init__(self, lean=False): self.lean = lean

    def _X(self, df):
        X = self.d(df); return X.drop(columns=EPC_MODELLED) if self.lean else X

    def fit(self, df):
        self.d = Design().fit(df); d = df[df.usage_status == "metered"]; X = self._X(d)
        self.e = _lgb().fit(X, np.log1p(d.elec_annual)); self.g = _lgb().fit(X, np.log1p(d.gas_annual)); return self

    def predict(self, df):
        X = self._X(df); return np.expm1(_booster_predict(self.e, X)), np.expm1(_booster_predict(self.g, X))


TRIVIAL_MEASURES = ("heat_pump", "condensing_boiler", "solar_pv")   # >95% one class by construction; excluded from the headline relevance metrics
USAGE_FEATS = ["elec_annual", "gas_annual", "intensity", "purchased", "gas_per_m2", "elec_per_m2", "metered_vs_epc", "gas_vs_epc_heatcost", "elec_share"]


def usage_features(M):
    """Metered-usage features (available at prediction time whenever the home has meter data; NaN otherwise, never 0).
    Metered use against what the EPC predicts exposes the hidden behaviour gap (thermostat setting, 'assumed' walls that are really insulated),
    which is what drives the saving of smart controls and wall insulation."""
    f = lambda c: M[c].astype(float) if c in M else pd.Series(np.nan, index=M.index)
    ea, ga, area = f("elec_annual"), f("gas_annual"), f("floor_area")
    purchased, intensity = ea + ga, f("intensity")
    U = pd.DataFrame({"elec_annual": ea, "gas_annual": ga, "intensity": intensity, "purchased": purchased, "gas_per_m2": ga / area, "elec_per_m2": ea / area,
                      "metered_vs_epc": intensity / f("epc_primary_kwh_m2"),
                      "gas_vs_epc_heatcost": ga / (f("epc_heating_cost_current") + f("epc_hot_water_cost_current") + 1),
                      "elec_share": ea / purchased}, index=M.index)
    return U[USAGE_FEATS].replace([np.inf, -np.inf], np.nan)


class RelevanceModel:
    """High/Medium/Low relevance of each feasible retrofit (retrofit recommender / classifier).
    * Features: property features + metered-usage features + monthly-shape ('twin') features (per-home fit of use against heating degree days). 15% of training rows have the usage block masked and 15% the EPC-modelled block masked,
      so the model also works for customer-entered homes that have no meter data or EPC numbers.
    * Probabilities are temperature-scaled on `val`, and predictions below `abstain_threshold` (confidence) are returned as 'needs survey'
      instead of a guess. The threshold is set on `val` to keep ~`coverage` of predictions."""
    CLASSES = ["Low", "Medium", "High"]

    def __init__(self, use_usage=True, use_twin=True, use_thermo=False): self.use_usage = use_usage; self.use_twin = use_twin and use_usage; self.use_thermo = use_thermo and use_usage; self.T = 1.0; self.abstain_threshold = 0.0

    def fit(self, df, lab, mask_frac=0.15, seed=42, masks=None):
        """masks: per-block hiding fractions {"usage", "twin", "thermo", "epc"} overriding mask_frac (the app model never hides usage,
        since bills are required, and hides the monthly shape for half the rows). Same random draws as before when not given."""
        f = {k: mask_frac for k in ("usage", "twin", "thermo", "epc")} | (masks or {})
        self.d = Design().fit(df); X = self._X(df, lab)
        rng = np.random.default_rng(seed)
        if self.use_usage:
            m = rng.random(len(X)) < f["usage"]; X.loc[m, USAGE_FEATS] = np.nan
            if self.use_twin: m3 = (rng.random(len(X)) < f["twin"]) | m; X.loc[m3, TWIN_COLS] = np.nan   # annual totals only, or no usage at all
            if self.use_thermo: m4 = rng.random(len(X)) < f["thermo"]; X.loc[m4, THERMO] = np.nan          # customer did not give a heating temperature
        m2 = rng.random(len(X)) < f["epc"]; X.loc[m2, EPC_MODELLED] = np.nan
        y = lab.relevance.map({c: i for i, c in enumerate(self.CLASSES)}).values
        self.m = lgb.LGBMClassifier(n_estimators=250, learning_rate=0.08, num_leaves=63, min_child_samples=30, subsample=0.8, subsample_freq=1,
                                    colsample_bytree=0.8, verbose=-1, n_jobs=-1, random_state=SEED, deterministic=True, force_row_wise=True).fit(X, y); return self

    def _X(self, df, lab):
        D = df.set_index("property_id"); ids = lab.property_id
        parts = [self.d(D).loc[ids].reset_index(drop=True)]
        if self.use_usage:
            parts.append(usage_features(D).loc[ids].reset_index(drop=True))
        if self.use_twin:
            parts.append(D.reindex(columns=TWIN_COLS).loc[ids].reset_index(drop=True).astype(float))
        if getattr(self, "use_thermo", False):      # getattr: models saved before this option existed have no attribute
            parts.append(D.reindex(columns=THERMO).loc[ids].reset_index(drop=True).astype(float))
        X = pd.concat(parts, axis=1) if len(parts) > 1 else parts[0]
        X["retrofit_id"] = pd.Categorical(lab.retrofit_id.values, categories=C.ORDER); return X

    def _raw(self, X): return np.log(np.clip(_booster_predict(self.m, X), 1e-9, 1))
    def predict_proba(self, df, lab):
        z = self._raw(self._X(df, lab)) / self.T; z -= z.max(1, keepdims=True); p = np.exp(z); return p / p.sum(1, keepdims=True)

    def calibrate(self, df, lab_val, coverage=0.80):
        """Temperature scaling (min log-loss) and the abstention threshold, both fitted on `val` only."""
        z = self._raw(self._X(df, lab_val)); y = lab_val.relevance.map({c: i for i, c in enumerate(self.CLASSES)}).values
        def nll(T):
            q = z / T; q -= q.max(1, keepdims=True); lp = q - np.log(np.exp(q).sum(1, keepdims=True)); return -lp[np.arange(len(y)), y].mean()
        Ts = np.arange(0.5, 3.01, 0.05); self.T = float(Ts[int(np.argmin([nll(T) for T in Ts]))])
        self.abstain_threshold = float(np.quantile(self.predict_proba(df, lab_val).max(1), 1 - coverage)); return self

    def decide(self, proba):
        """-> (class index, confidence, needs_survey mask)."""
        conf = proba.max(1); return proba.argmax(1), conf, conf < self.abstain_threshold

    def predict_property(self, p: dict, retrofits):
        """One home (dataset or customer-entered) -> {retrofit: {relevance, confidence, needs_survey}}."""
        row = pd.DataFrame([p]).assign(property_id="_x"); lab = pd.DataFrame({"property_id": "_x", "retrofit_id": list(retrofits)})
        if lab.empty: return {}
        cls, conf, ns = self.decide(self.predict_proba(row, lab))
        return {r: {"relevance": "needs survey" if n else self.CLASSES[c], "model_class": self.CLASSES[c], "confidence": round(float(k), 3), "needs_survey": bool(n)}
                for r, c, k, n in zip(lab.retrofit_id, cls, conf, ns)}


VALUE_FEATS = ["rel_lat", "rel_lon", "dist_c", "log_hpi", "property_type", "built_form", "floor_area", "habitable_rooms", "age_year_est"]   # SAP excluded on purpose
HPI_FILE = Path(__file__).parent / "reference" / "council_hpi_2026-07.csv"   # HM Land Registry UK HPI, average price by council and type, July 2026


def hpi_reference_price(df):
    """Market-level anchor: the council's HPI average price for the home's type (detached / semi / terraced / flat), else the council average.
    Values are public (HM Land Registry UK HPI, 2026-07, see reference/council_hpi_2026-07.csv); no sale price of any held-out home is used."""
    h = pd.read_csv(HPI_FILE).set_index("local_authority")
    la = df.local_authority.astype(str); bf = df.built_form.astype(str); pt = df.property_type.astype(str)
    col = np.where(pt.isin(["Flat", "Maisonette"]), "flat_maisonette", np.where(bf == "Detached", "detached", np.where(bf == "Semi-Detached", "semi_detached",
          np.where(bf.isin(["Mid-Terrace", "End-Terrace"]), "terraced", "avg_price"))))
    price = np.array([h.at[l, c] if l in h.index else np.nan for l, c in zip(la, col)], float)
    avg = np.array([h.at[l, "avg_price"] if l in h.index else np.nan for l in la], float)
    return np.where(np.isnan(price), avg, price)


class ValueModel:
    """Hedonic model with a transparent rating premium (partialling-out / double-ML style):
      stage 1: LightGBM on size, type, built form, age and location RELATIVE to the council centre (NOT SAP, NOT absolute coordinates) predicting the
               log of price relative to the council's HPI average for that type (price = latest real sale, HPI-indexed to 2026-07). Predicted price =
               HPI reference x exp(model). Anchoring on a public market-level price lets the model carry over to a council it never saw;
      stage 2: the log-price residual regressed on SAP -> premium beta per SAP point; bootstrap over homes -> CI.
    Uplift for a retrofit = exp(beta * (SAP_after - SAP_before)) - 1 for the SAME home (everything else fixed).
    Range = 2.5th-97.5th percentile of the POOLED bootstrap of four specifications (A ML-partialled, B outcode FE + type + area + age, C minimal controls, D council-level cluster bootstrap), so it reflects specification and between-city heterogeneity as well as sampling noise. Associational, not causal."""
    def set_centroids(self, M):
        self.centroids = M.groupby(M.local_authority.astype(str))[["lat", "lon"]].mean().to_dict("index"); return self

    def _X(self, df):
        X = pd.DataFrame(index=df.index); la = df.local_authority.astype(str)
        X["rel_lat"] = df.lat.astype(float).values - la.map(lambda l: self.centroids[l]["lat"]).values
        X["rel_lon"] = df.lon.astype(float).values - la.map(lambda l: self.centroids[l]["lon"]).values
        X["dist_c"] = np.hypot(X.rel_lat, X.rel_lon * 0.6)           # distance from the council centre (degrees, longitude scaled)
        X["log_hpi"] = np.log(hpi_reference_price(df))              # market level of the council for this home type
        for c in ["floor_area", "habitable_rooms", "age_year_est"]:
            X[c] = df[c].astype(float)
        for c in ["property_type", "built_form"]:
            X[c] = pd.Categorical(df[c].astype(str), categories=self.cats[c])
        return X[VALUE_FEATS]

    def fit(self, h, rated, n_boot=500, seed=0):
        """h: one row per home = features + `price_indexed_valuation` (latest real non-new-build sale) -> stage 1 (level).
        rated: sales whose rating at sale is KNOWN (energy_rating_at_sale != 'unknown'; 99.7% equal the current band, so the recorded
        SAP is the SAP at sale) -> stage 2 (premium). Rating at sale is never guessed for the other sales."""
        from sklearn.model_selection import GroupKFold
        h = h.dropna(subset=["price_indexed_valuation"]).reset_index(drop=True)
        self.cats = {c: sorted(h[c].astype(str).unique()) for c in ["property_type", "built_form"]}
        X = self._X(h); ref = np.log(hpi_reference_price(h)); y = np.log(h.price_indexed_valuation.values) - ref; oof = np.zeros(len(h))
        for tr_i, te_i in GroupKFold(5).split(X, groups=h.postcode.values):
            oof[te_i] = _lgb(n_estimators=300).fit(X.iloc[tr_i], y[tr_i]).predict(X.iloc[te_i])
        self.base = _lgb(n_estimators=300).fit(X, y)
        oof_by = dict(zip(h.property_id, oof + ref)); self.sap_mean = float(h.sap_score.astype(float).mean())
        rated = rated.dropna(subset=["price_indexed_valuation"]).reset_index(drop=True)
        pred = np.array([oof_by.get(pid, np.nan) for pid in rated.property_id])
        miss = np.isnan(pred)
        if miss.any(): pred[miss] = self.base.predict(self._X(rated[miss])) + np.log(hpi_reference_price(rated[miss]))
        r = np.log(rated.price_indexed_valuation.values) - pred; sap = rated.sap_score.values.astype(float)
        rng = np.random.default_rng(seed); n = len(rated); betas = []
        for _ in range(n_boot // 2):
            i = rng.integers(0, n, n); sc = sap[i] - sap[i].mean()
            betas.append(float((sc * (r[i] - r[i].mean())).sum() / (sc ** 2).sum()))
        # specification B (simple, transparent): log price ~ outcode FE + type + log area + age + SAP, bootstrapped over sales.
        # Pooling A (ML-partialled) and B reflects specification uncertainty, not just sampling noise.
        D = pd.get_dummies(rated[["outcode", "property_type"]].astype(str), drop_first=True).astype(float)
        D["log_area"] = np.log(rated.floor_area.astype(float)); D["age"] = rated.age_year_est.astype(float); D["sap"] = sap; D["c"] = 1.0
        Dv, yv = D.values, np.log(rated.price_indexed_valuation.values); j = list(D.columns).index("sap"); betas_b = []
        for _ in range(n_boot // 2):
            i = rng.integers(0, n, n); betas_b.append(float(np.linalg.lstsq(Dv[i], yv[i], rcond=None)[0][j]))
        # specification C (minimal controls, close to the dataset's own premium fit): outcode FE + type + log area + SAP
        D2 = D.drop(columns=["age"]); D2v = D2.values; j2 = list(D2.columns).index("sap"); betas_c = []
        for _ in range(n_boot // 2):
            i = rng.integers(0, n, n); betas_c.append(float(np.linalg.lstsq(D2v[i], yv[i], rcond=None)[0][j2]))
        # specification D (geographic heterogeneity): resample whole COUNCILS with replacement, council FE + type + log area + SAP.
        # The rating premium differs a lot between cities in the data, so a range that ignores this would be over-confident for any new area.
        las = rated.local_authority.astype(str).values; ula = np.unique(las); idx_by = {l: np.where(las == l)[0] for l in ula}; betas_d = []
        for _ in range(n_boot // 2):
            draw = rng.choice(ula, len(ula), replace=True); i = np.concatenate([idx_by[l] for l in draw])
            Dd = pd.get_dummies(rated.iloc[i][["local_authority", "property_type"]].astype(str), drop_first=True).astype(float)
            Dd["log_area"] = np.log(rated.floor_area.astype(float).values[i]); Dd["sap"] = sap[i]; Dd["c"] = 1.0
            betas_d.append(float(np.linalg.lstsq(Dd.values, yv[i], rcond=None)[0][list(Dd.columns).index("sap")]))
        self.beta_a, self.beta_b, self.beta_c, self.beta_d = (float(np.mean(v)) for v in (betas, betas_b, betas_c, betas_d))
        self.betas = np.concatenate([betas, betas_b, betas_c, betas_d]); self.beta = float(self.betas.mean()); self.n_fit = n
        return self

    def price(self, df):
        return hpi_reference_price(df) * np.exp(self.base.predict(self._X(df)) + self.beta * (df.sap_score.values.astype(float) - self.sap_mean))

    def premium_summary(self):
        lo, hi = np.percentile(self.betas, [2.5, 97.5])
        return {"pct_per_10_sap": 100 * (np.exp(10 * self.beta) - 1), "spec_A_ml_partialled_pct_per_10_sap": 100 * (np.exp(10 * self.beta_a) - 1), "spec_B_outcode_fe_pct_per_10_sap": 100 * (np.exp(10 * self.beta_b) - 1), "spec_C_minimal_controls_pct_per_10_sap": 100 * (np.exp(10 * self.beta_c) - 1), "spec_D_city_cluster_bootstrap_pct_per_10_sap": 100 * (np.exp(10 * self.beta_d) - 1), "ci95_pct_per_10_sap": [100 * (np.exp(10 * lo) - 1), 100 * (np.exp(10 * hi) - 1)], "n_sales": self.n_fit}

    def uplift_batch(self, df, sap_after):
        d = np.maximum(np.asarray(sap_after, float) - df.sap_score.values.astype(float), 0.0)
        pct = 100 * (np.exp(np.outer(self.betas, d)) - 1)
        lo, mid, hi = np.percentile(pct, [2.5, 50, 97.5], axis=0)
        return pd.DataFrame({"low_pct": np.maximum(lo, 0), "mid_pct": np.maximum(mid, 0), "high_pct": np.maximum(hi, 0)}, index=df.index)

    def uplift(self, p: dict, sap_after: float):
        v = p.get("current_value_estimate")
        if v is None or (isinstance(v, float) and np.isnan(v)):
            return None
        u = self.uplift_batch(pd.DataFrame([{"sap_score": p["sap_score"]}]), [sap_after]).iloc[0]
        return {"low_pct": float(u.low_pct), "mid_pct": float(u.mid_pct), "high_pct": float(u.high_pct),
                "low_gbp": float(v * (1 + u.low_pct / 100)), "high_gbp": float(v * (1 + u.high_pct / 100))}


def save(obj, name): C.MODELS.mkdir(exist_ok=True); joblib.dump(obj, C.MODELS / f"{name}.joblib")
def load(name): return joblib.load(C.MODELS / f"{name}.joblib")

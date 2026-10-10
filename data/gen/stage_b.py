"""Steps 8-11: sales + current value, reference labels, reference tables, EPC recommendations."""
import json
import re
import time

import duckdb
import numpy as np
import pandas as pd

from . import constants as K
from .paths import HIDDEN, OUT, RAW

LR_COLS = ["tid", "price", "date", "postcode", "lr_type", "new_build", "duration", "paon", "saon", "street",
           "locality", "town", "district", "county", "ppd_category", "record_status"]
HPI_REGION = {"Bristol, City of": "City of Bristol"}
HPI_COL = {"D": "DetachedIndex", "S": "SemiDetachedIndex", "T": "TerracedIndex", "F": "FlatIndex"}
EF_ELEC = 0.177 + 0.01853   # DESNZ 2025: UK electricity generated + T&D losses, kg CO2e/kWh
EF_GAS = 0.18296            # DESNZ 2025: natural gas, kWh (gross CV), kg CO2e/kWh


def _write(df, name, folder=OUT):
    df.to_parquet(folder / f"{name}.parquet", index=False)
    df.to_csv(folder / f"{name}.csv", index=False)


def _norm(s):
    return " " + re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9]", " ", str(s).upper())).strip() + " " if isinstance(s, str) and s else " "


# ------------------------------------------------------------------ sales
def load_sales(postcodes):
    con = duckdb.connect()
    con.register("pcs", pd.DataFrame({"postcode": sorted(postcodes)}))
    files = sorted(str(f) for f in (RAW / "landregistry").glob("pp-20*.csv"))
    cols = ", ".join(f"'column{i:02d}': 'VARCHAR'" for i in range(16))
    q = f"""select * from read_csv({files}, header=false, columns={{{", ".join(f"'{c}': 'VARCHAR'" for c in LR_COLS)}}})
            where postcode in (select postcode from pcs)"""
    s = con.sql(q).df()
    s["price"] = pd.to_numeric(s["price"])
    s["date"] = pd.to_datetime(s["date"].str[:10])
    s = s[s["record_status"] != "D"].drop_duplicates("tid", keep="last")
    return s.sort_values(["date", "tid"]).reset_index(drop=True)   # deterministic order (DuckDB reads in parallel)


def match_sales(sales, crosswalk):
    """Postcode + PAON/SAON match of Land Registry sales to EPC homes (unique candidate only)."""
    cw = crosswalk.copy()
    cw["addr"] = (cw["address1"].fillna("") + " " + cw["address2"].fillna("") + " " + cw["address3"].fillna("")).map(_norm)
    by_pc = {pc: list(zip(g["property_id"], g["addr"])) for pc, g in cw.groupby("postcode")}
    flatwords = (" FLAT ", " APARTMENT ", " UNIT ", " MAISONETTE ", " STUDIO ")
    out = []
    for r in sales.itertuples(index=False):
        cands = by_pc.get(r.postcode)
        if not cands:
            out.append(None)
            continue
        paon, saon = _norm(r.paon), _norm(r.saon)
        hits = []
        for pid, addr in cands:
            if paon == " " or paon not in addr:
                continue
            if saon != " ":
                if saon not in addr and (" FLAT" + saon) not in addr:
                    continue
            elif any(w in addr for w in flatwords) and not any(w in paon for w in flatwords):
                continue
            hits.append(pid)
        out.append(hits[0] if len(hits) == 1 else None)
    sales = sales.assign(property_id=out)
    return sales[sales["property_id"].notna()].copy()


def hpi_table():
    h = pd.read_csv(RAW / "landregistry/UK-HPI-full-file-2026-07.csv")
    h["month"] = pd.to_datetime(h["Date"], dayfirst=True).dt.to_period("M").astype(str)
    return h


def index_to_valuation(df, la_col, type_col, date_col, h):
    """price x HPI(valuation month) / HPI(sale month), council x property type (all-property index fallback)."""
    reg = df[la_col].map(lambda x: HPI_REGION.get(x, x))
    m = df[date_col].dt.to_period("M").astype(str)
    hv = h[h["month"] == K.VALUATION_MONTH].set_index("RegionName")
    hh = h.set_index(["RegionName", "month"])
    col = df[type_col].map(HPI_COL).fillna("Index")
    num, den = [], []
    for rg, mo, c in zip(reg, m, col):
        try:
            a, b = hv.at[rg, c], hh.at[(rg, mo), c]
            if pd.isna(a) or pd.isna(b):
                a, b = hv.at[rg, "Index"], hh.at[(rg, mo), "Index"]
        except KeyError:
            a, b = np.nan, np.nan
        num.append(a)
        den.append(b)
    return np.array(num, float) / np.array(den, float)


def lr_type_for(p):
    bf = p["built_form"].fillna("")
    return np.select([p["property_type"].isin(["Flat", "Maisonette"]), bf.eq("Detached"), bf.eq("Semi-Detached"),
                      bf.str.contains("Terrace")], ["F", "D", "S", "T"], "S")


def build_sales_and_value(props, allc, crosswalk, seed, log):
    import lightgbm as lgb
    from sklearn.model_selection import GroupKFold

    t = time.time()
    sales = load_sales(set(props["postcode"].dropna()))
    raw_n = len(sales)
    sales = sales[(sales["ppd_category"] == "A") & (sales["lr_type"] != "O")]
    # Drop implausible single-dwelling prices (share transfers, whole-block sales) [design]
    sales = sales[(sales["price"] >= 25_000) & (sales["price"] <= 15_000_000)]
    m = match_sales(sales, crosswalk)
    log["sales"] = {"lr_sales_in_our_postcodes": raw_n, "standard_category_A_not_O": len(sales), "matched_sales": len(m),
                    "homes_with_matched_sale": int(m["property_id"].nunique()),
                    "match_rate_homes": round(m["property_id"].nunique() / len(props), 4)}
    print("sales", log["sales"], f"({time.time() - t:.0f}s)")

    # Rating at sale: latest certificate lodged on/before the sale date (any lodgement for that home)
    cert = allc[["certificate_number", "uprn", "lodgement_date", "current_energy_rating", "current_energy_efficiency"]]
    key = crosswalk[["property_id", "uprn", "certificate_number"]]
    c1 = cert.dropna(subset=["uprn"]).merge(key[["property_id", "uprn"]].dropna(), on="uprn")
    c2 = cert.merge(key[key["uprn"].isna()][["property_id", "certificate_number"]], on="certificate_number")
    certs = pd.concat([c1, c2])[["property_id", "lodgement_date", "current_energy_rating", "current_energy_efficiency"]]
    m = m.sort_values(["date", "tid"]).reset_index(drop=True)
    certs = certs.sort_values(["lodgement_date", "current_energy_efficiency"], kind="stable")
    m = pd.merge_asof(m, certs, left_on="date", right_on="lodgement_date", by="property_id", direction="backward")
    m["energy_rating_at_sale"] = m["current_energy_rating"].fillna("unknown")
    m["sap_at_sale"] = m["current_energy_efficiency"]

    la = props.set_index("property_id")["local_authority"]
    m["local_authority"] = m["property_id"].map(la)
    hpi = hpi_table()
    m["hpi_factor"] = index_to_valuation(m, "local_authority", "lr_type", "date", hpi)
    m["price_indexed_valuation"] = m["price"] * m["hpi_factor"]
    sales_hist = m[["property_id", "date", "price", "lr_type", "new_build", "duration", "energy_rating_at_sale",
                    "hpi_factor", "price_indexed_valuation"]].rename(columns={"lr_type": "property_type_lr", "duration": "tenure_lr"})
    sales_hist = sales_hist.assign(date=sales_hist["date"].dt.date.astype(str)).sort_values(["property_id", "date", "price"], kind="stable").reset_index(drop=True)
    log["sales"]["sales_with_known_rating_at_sale"] = int((m["energy_rating_at_sale"] != "unknown").sum())

    # ---- hedonic model of current value (LightGBM), trained on latest indexed sale per home
    last = m.sort_values(["date", "tid"]).drop_duplicates("property_id", keep="last").set_index("property_id")
    feats = ["local_authority", "outcode", "property_type", "built_form", "floor_area", "habitable_rooms",
             "age_year_est", "sap_score", "lat", "lon", "lr_type_code"]
    X = props.set_index("property_id").assign(lr_type_code=lr_type_for(props)).loc[:, feats[:-1] + ["lr_type_code"]].copy()
    for c in ["local_authority", "outcode", "property_type", "built_form", "lr_type_code"]:
        X[c] = X[c].astype("category")
    tr = last.index.intersection(X.index)
    tr = tr[np.isfinite(last.loc[tr, "price_indexed_valuation"])]
    y = np.log(last.loc[tr, "price_indexed_valuation"].values)
    groups = props.set_index("property_id").loc[tr, "postcode"].values
    params = dict(n_estimators=600, learning_rate=0.05, num_leaves=63, min_child_samples=30, subsample=0.8,
                  subsample_freq=1, colsample_bytree=0.8, random_state=seed, verbose=-1,
                  deterministic=True, force_col_wise=True, n_jobs=4)
    oof = np.zeros(len(tr))
    base = np.zeros(len(tr))
    Xt = X.loc[tr]
    for f_tr, f_te in GroupKFold(5).split(Xt, y, groups):
        mdl = lgb.LGBMRegressor(**params).fit(Xt.iloc[f_tr], y[f_tr])
        oof[f_te] = mdl.predict(Xt.iloc[f_te])
        ppm = pd.Series(np.exp(y[f_tr]) / Xt["floor_area"].iloc[f_tr].values, index=Xt["outcode"].iloc[f_tr].values)
        med = ppm.groupby(level=0).median()
        base[f_te] = Xt["outcode"].iloc[f_te].map(med).astype(float).fillna(ppm.median()).values * Xt["floor_area"].iloc[f_te].values
    ape = lambda pred: float(np.median(np.abs(pred - np.exp(y)) / np.exp(y)))
    log["value_model"] = {"train_homes": int(len(tr)), "cv": "GroupKFold(5) by postcode",
                          "median_ape_lightgbm": round(ape(np.exp(oof)), 4),
                          "median_ape_baseline_outcode_gbp_per_m2": round(ape(base), 4),
                          "mape_lightgbm": round(float(np.mean(np.abs(np.exp(oof) - np.exp(y)) / np.exp(y))), 4)}
    print("value model", log["value_model"])
    mdl = lgb.LGBMRegressor(**params).fit(Xt, y)
    pred = np.exp(mdl.predict(X))
    cur = pd.Series(pred, index=X.index)
    src = pd.Series("hedonic_model", index=X.index)
    idx_sale = pd.Series(last.loc[tr, "price_indexed_valuation"].values, index=tr)
    ratio = idx_sale / cur.loc[tr]
    ok = (ratio > 1 / 3) & (ratio < 3)          # indexed sale wildly off the model -> likely mismatch [design]
    cur.loc[ok[ok].index] = idx_sale[ok]
    src.loc[ok[ok].index] = "last_sale_hpi_indexed"
    src.loc[ok[~ok].index] = "hedonic_model_sale_outlier"
    log["value_model"]["matched_sales_rejected_as_outliers"] = int((~ok).sum())
    props["current_value_estimate"] = (props["property_id"].map(cur) / 1000).round() * 1000
    props["value_source"] = props["property_id"].map(src)
    props["value_model_estimate"] = (props["property_id"].map(pd.Series(pred, index=X.index)) / 1000).round() * 1000
    props["value_valuation_month"] = K.VALUATION_MONTH

    # ---- rating premium from real sales with a known rating at sale (reference for value uplift)
    r = m[(m["energy_rating_at_sale"] != "unknown") & m["sap_at_sale"].notna()].copy()
    r = r.merge(props[["property_id", "floor_area", "property_type", "age_band", "outcode"]], on="property_id")
    r = r[np.isfinite(r["price_indexed_valuation"]) & (r["floor_area"] > 10)]
    yv = np.log(r["price_indexed_valuation"].values)
    D = pd.get_dummies(r[["property_type", "age_band", "lr_type"]].astype(str), drop_first=True).astype(float)
    Xr = pd.concat([pd.DataFrame({"sap10": r["sap_at_sale"].values / 10, "log_area": np.log(r["floor_area"].values)}, index=r.index), D], axis=1)
    # outcode fixed effects by within-outcode demeaning
    g = r["outcode"].values
    Xd = Xr - Xr.groupby(g).transform("mean")
    yd = yv - pd.Series(yv, index=r.index).groupby(g).transform("mean").values
    keep = Xd.std() > 0
    Xd = Xd.loc[:, keep].values
    beta, *_ = np.linalg.lstsq(Xd, yd, rcond=None)
    resid = yd - Xd @ beta
    n_, k_ = Xd.shape
    XtX_inv = np.linalg.pinv(Xd.T @ Xd)
    meat = (Xd * resid[:, None] ** 2).T @ Xd
    cov = XtX_inv @ meat @ XtX_inv * n_ / max(n_ - k_ - len(set(g)), 1)
    b, se = beta[0], np.sqrt(cov[0, 0])
    log["rating_premium"] = {"n_sales": int(n_), "outcodes": int(len(set(g))), "coef_log_price_per_10_sap": round(float(b), 4),
                             "se_hc1": round(float(se), 4), "ci95": [round(float(b - 1.96 * se), 4), round(float(b + 1.96 * se), 4)],
                             "controls": "log floor area, property type, age band, LR type, outcode fixed effects; prices HPI-indexed to valuation month",
                             "interpretation": "associational, not causal"}
    print("rating premium", log["rating_premium"])
    return props, sales_hist, (b, se)


# ------------------------------------------------------------------ retrofit simulator (labels)
RETROFITS = ["loft_insulation", "cavity_wall_insulation", "solid_wall_insulation", "floor_insulation", "double_glazing",
             "smart_controls", "heat_pump", "condensing_boiler", "solar_pv"]


def simulate_retrofits(props, comp, hid):
    p, c, h = props.reset_index(drop=True), comp.reset_index(drop=True), hid.reset_index(drop=True)
    n = len(p)
    hf, wf = c["heating_fuel"].to_numpy(object), c["hot_water_fuel"].to_numpy(object)
    det = p["heating_detail"].to_numpy(object)
    house = p["property_type"].isin(["House", "Bungalow"]).values
    scope = p["fuel_scope"].eq("gas_elec").values
    loft = p["loft_mm"].values
    ri = p["roof_insulation"].to_numpy(object)
    wi = p["wall_insulation"].to_numpy(object)
    wt = p["wall_type"].to_numpy(object)
    gl = p["glazing_level"].values
    cl = p["controls_level"].values
    true_ins = h["true_wall_insulated_despite_epc"].values
    setp = h["setpoint_c"].values
    yld = p["climate_region"].map(K.PV_YIELD).fillna(780).values
    has_pv = p["solar_kwp_est"].fillna(0).values > 0

    feas = {
        "loft_insulation": (p["roof_type"].eq("pitched").values & ((np.nan_to_num(loft, nan=999) < 200) | np.isin(ri, ["none", "limited"]))),
        "cavity_wall_insulation": (wt == "cavity") & np.isin(wi, ["none", "partial"]),
        "solid_wall_insulation": np.isin(wt, ["solid_brick", "stone", "system_built"]) & np.isin(wi, ["none", "partial"]),
        "floor_insulation": p["floor_insulation"].eq("none").values & p["floor_type"].isin(["solid", "suspended"]).values,
        "double_glazing": np.nan_to_num(gl, nan=9) <= 2,
        "smart_controls": (np.nan_to_num(cl, nan=9) <= 2) & np.isin(hf, ["gas", "elec"]) & ~np.isin(det, ["heat_pump_air", "heat_pump_ground"]),
        "heat_pump": house & scope & np.isin(det, ["gas_boiler", "gas_warm_air", "gas_room_heaters", "electric_storage", "electric_direct", "electric_boiler"]),
        "condensing_boiler": (det == "gas_boiler") & (p["boiler_condensing"].values == False),  # noqa: E712
        "solar_pv": house & p["roof_type"].isin(["pitched", "flat"]).values & ~has_pv,
    }
    for k in feas:
        feas[k] = feas[k] & scope
    loft_frac = np.where((np.nan_to_num(loft, nan=-1) == 0) | (ri == "none"), 0.15,
                         np.where((np.nan_to_num(loft, nan=999) < 100) | (ri == "limited"), 0.08, 0.03))
    eff0 = np.select([det == "gas_boiler", np.isin(det, ["gas_warm_air", "gas_room_heaters"]), np.isin(det, ["heat_pump_air", "heat_pump_ground"])],
                     [np.where(p["boiler_condensing"].values == True, K.BOILER_EFF_CONDENSING, K.BOILER_EFF_NONCONDENSING), 0.65, K.SCOP_SPACE], 1.0)  # noqa: E712

    def state0():
        return {"heat": c["space_heat_kwh"].values.copy(), "hw": c["hot_water_kwh"].values.copy(),
                "hf": hf.copy(), "wf": wf.copy(), "eff": eff0.copy(), "pv_gen": c["solar_generation_kwh"].values.copy(),
                "base_elec": (c["lighting_kwh"] + c["appliance_kwh"]).values, "cook": c["gas_cooking_kwh"].values}

    def totals(s):
        gas = np.where(s["hf"] == "gas", s["heat"], 0) + np.where(s["wf"] == "gas", s["hw"], 0) + s["cook"]
        elec = s["base_elec"] + np.where(s["hf"] == "elec", s["heat"], 0) + np.where(s["wf"] == "elec", s["hw"], 0)
        imp = elec - np.minimum(K.PV_SELF_CONSUMPTION * s["pv_gen"], 0.5 * elec)
        return gas, imp

    def apply(s, r, mask):
        s = {k: (v.copy() if isinstance(v, np.ndarray) else v) for k, v in s.items()}
        if r == "loft_insulation":
            s["heat"] = np.where(mask, s["heat"] * (1 - loft_frac), s["heat"])
        elif r == "cavity_wall_insulation":
            f = np.where(true_ins, 0.02, np.where(wi == "none", 0.12, 0.06))
            s["heat"] = np.where(mask, s["heat"] * (1 - f), s["heat"])
        elif r == "solid_wall_insulation":
            f = np.where(true_ins, 0.03, np.where(wi == "none", 0.22, 0.10))
            s["heat"] = np.where(mask, s["heat"] * (1 - f), s["heat"])
        elif r == "floor_insulation":
            f = np.where(p["floor_type"].eq("suspended").values, 0.06, 0.04)
            s["heat"] = np.where(mask, s["heat"] * (1 - f), s["heat"])
        elif r == "double_glazing":
            f = np.select([gl == 0, gl == 1, gl == 2], [0.10, 0.07, 0.04], 0)
            s["heat"] = np.where(mask, s["heat"] * (1 - f), s["heat"])
        elif r == "smart_controls":
            f = 0.06 * np.clip(1 + (setp - K.SETPOINT_MEAN_C) / 2, 0.5, 1.8)   # bigger where the hidden setpoint is high
            s["heat"] = np.where(mask, s["heat"] * (1 - f), s["heat"])
        elif r == "condensing_boiler":
            f = 1 - K.BOILER_EFF_NONCONDENSING / K.BOILER_EFF_CONDENSING
            s["heat"] = np.where(mask & (s["hf"] == "gas"), s["heat"] * (1 - f), s["heat"])
            s["hw"] = np.where(mask & (s["wf"] == "gas"), s["hw"] * (1 - f), s["hw"])
            s["eff"] = np.where(mask & (s["hf"] == "gas"), K.BOILER_EFF_CONDENSING, s["eff"])
        elif r == "heat_pump":
            useful = s["heat"] * s["eff"]
            s["heat"] = np.where(mask, useful / K.SCOP_SPACE, s["heat"])
            s["hf"] = np.where(mask, "elec", s["hf"])
            s["eff"] = np.where(mask, K.SCOP_SPACE, s["eff"])
            hw_eff = np.where(s["wf"] == "gas", 0.80, 1.0)
            conv = mask & np.isin(s["wf"], ["gas", "elec"])
            s["hw"] = np.where(conv, s["hw"] * hw_eff / K.SCOP_DHW, s["hw"])
            s["wf"] = np.where(conv, "elec", s["wf"])
        elif r == "solar_pv":
            s["pv_gen"] = np.where(mask, s["pv_gen"] + K.PV_RETROFIT_KWP * yld, s["pv_gen"])
        return s

    s0 = state0()
    g0, i0 = totals(s0)
    E0 = g0 + i0
    rows = []
    for r in RETROFITS:
        g1, i1 = totals(apply(s0, r, feas[r]))
        rows.append(pd.DataFrame({"property_id": p["property_id"].values, "retrofit_id": r, "feasible": feas[r],
                                  "elec_saving_kwh": np.where(feas[r], i0 - i1, np.nan).round(0),
                                  "gas_saving_kwh": np.where(feas[r], g0 - g1, np.nan).round(0)}))
    lr = pd.concat(rows, ignore_index=True)
    E0r = np.tile(E0, len(RETROFITS))
    share = (lr["elec_saving_kwh"] + lr["gas_saving_kwh"]) / np.where(E0r > 0, E0r, np.nan)
    lr["relevance"] = np.select([~lr["feasible"], share >= 0.10, share >= 0.03, share > 0], ["not_feasible", "High", "Medium", "Low"], "Low")
    lr["co2_saving_kg"] = (lr["elec_saving_kwh"] * EF_ELEC + lr["gas_saving_kwh"] * EF_GAS).round(0)

    # Package: fabric first, heat pump replaces the boiler upgrade where feasible
    s = s0
    seq = []
    for r in ["loft_insulation", "cavity_wall_insulation", "solid_wall_insulation", "floor_insulation", "double_glazing",
              "smart_controls", "heat_pump", "condensing_boiler", "solar_pv"]:
        mask = (feas[r] & ~feas["heat_pump"]) if r == "condensing_boiler" else feas[r].astype(bool)
        gb, ib = totals(s)
        s = apply(s, r, mask)
        ga, ia = totals(s)
        seq.append(pd.DataFrame({"property_id": p["property_id"].values, "retrofit_id": r, "applied": mask,
                                 "marginal_elec_saving_kwh": np.where(mask, ib - ia, 0).round(0),
                                 "marginal_gas_saving_kwh": np.where(mask, gb - ga, 0).round(0)}))
    g1, i1 = totals(s)
    E1 = g1 + i1
    # Alternative package without a heat pump (boiler upgrade instead), so rankings aren't dominated by fuel switching
    s_nh = s0
    for r in ["loft_insulation", "cavity_wall_insulation", "solid_wall_insulation", "floor_insulation", "double_glazing",
              "smart_controls", "condensing_boiler", "solar_pv"]:
        s_nh = apply(s_nh, r, feas[r])
    gn, inh = totals(s_nh)
    En = gn + inh
    reason = np.where(~scope, "fuel_scope " + p["fuel_scope"].astype(str).values + ": purchased energy is not grid electricity + gas",
                      np.where(E0 <= 0, "zero or missing baseline", ""))
    ip = np.where(reason == "", 100 * (E0 - E1) / np.where(E0 > 0, E0, np.nan), np.nan)
    lp = pd.DataFrame({"property_id": p["property_id"].values, "elec_import_before_kwh": i0.round(0), "gas_before_kwh": g0.round(0),
                       "elec_import_after_kwh": i1.round(0), "gas_after_kwh": g1.round(0),
                       "elec_saving_kwh": (i0 - i1).round(0), "gas_saving_kwh": (g0 - g1).round(0),
                       "co2_saving_kg": ((i0 - i1) * EF_ELEC + (g0 - g1) * EF_GAS).round(0),
                       "improvement_potential_pct": np.round(ip, 2), "improvement_potential_unavailable_reason": reason,
                       "measures_applied": (lambda q: q[q["applied"].astype(bool)])(pd.concat(seq)).groupby("property_id")["retrofit_id"].agg("+".join).reindex(p["property_id"]).fillna("").values})
    lp["improvement_potential_pct_no_heat_pump"] = np.where(reason == "", np.round(100 * (E0 - En) / np.where(E0 > 0, E0, np.nan), 2), np.nan)
    lp["elec_saving_kwh_no_heat_pump"] = (i0 - inh).round(0)
    lp["gas_saving_kwh_no_heat_pump"] = (g0 - gn).round(0)
    epc_pot = 100 * (p["epc_primary_kwh_m2"] - p["epc_primary_kwh_m2_potential"]) / p["epc_primary_kwh_m2"]
    lp["epc_potential_improvement_pct"] = epc_pot.round(2).values
    lp["improvement_rank"] = lp["improvement_potential_pct"].rank(ascending=False, method="min")
    lp["improvement_rank_no_heat_pump"] = lp["improvement_potential_pct_no_heat_pump"].rank(ascending=False, method="min")
    return lr, lp, pd.concat(seq, ignore_index=True)


# ------------------------------------------------------------------ reference tables
EPC_REC_MAP = {"5": "loft_insulation", "6": "cavity_wall_insulation", "66": "cavity_wall_insulation", "7": "solid_wall_insulation",
               "57": "floor_insulation", "58": "floor_insulation", "8": "double_glazing", "9": "double_glazing", "56": "double_glazing",
               "11": "smart_controls", "12": "smart_controls", "13": "smart_controls", "14": "smart_controls", "15": "smart_controls",
               "16": "smart_controls", "17": "smart_controls", "18": "smart_controls", "51": "heat_pump", "52": "heat_pump",
               "20": "condensing_boiler", "27": "condensing_boiler", "29": "condensing_boiler", "37": "condensing_boiler",
               "38": "condensing_boiler", "40": "condensing_boiler", "34": "solar_pv"}


def epc_recommendations(crosswalk):
    rec = duckdb.sql(f"select * from read_csv('{RAW}/epc/batch2/recommendations.csv', all_varchar=true)").df()
    rec = rec.merge(crosswalk[["certificate_number", "property_id"]], on="certificate_number")
    rec["mapped_retrofit"] = rec["improvement_id"].map(EPC_REC_MAP)
    return rec[["property_id", "improvement_item", "improvement_id", "improvement_summary_text", "indicative_cost", "mapped_retrofit"]]


def _cost_range(series):
    vals = []
    for s in series.dropna():
        nums = [float(x.replace(",", "")) for x in re.findall(r"£([\d,]+)", s)]
        if nums:
            vals.append((nums[0], nums[-1]))
    if not vals:
        return np.nan, np.nan
    a = np.array(vals)
    return float(np.median(a[:, 0])), float(np.median(a[:, 1]))


def retrofit_catalogue(recs):
    spec = [
        ("loft_insulation", "Loft insulation to 270 mm", "pitched roof AND (loft < 200 mm OR roof insulation none/limited)",
         "space_heating", "3-15% of space heating (by starting depth: 0 mm 15%, <100 mm 8%, 100-199 mm 3%)",
         "brief 12-18% (uninsulated); NEED metered loft savings ~3% of gas [approx]"),
        ("cavity_wall_insulation", "Cavity wall insulation", "cavity wall AND insulation none/partial",
         "space_heating", "12% (none) / 6% (partial) of space heating", "NEED metered cavity wall median ~8% of gas [approx]"),
        ("solid_wall_insulation", "Internal or external solid wall insulation", "solid brick/stone/system-built wall AND insulation none/partial",
         "space_heating", "22% (none) / 10% (partial) of space heating", "NEED 2026: 17% median gas saving (whole house) [cited]"),
        ("floor_insulation", "Floor insulation", "ground floor solid/suspended AND no insulation",
         "space_heating", "6% (suspended) / 4% (solid) of space heating", "[design] no NEED metered figure"),
        ("double_glazing", "Replace single/partial glazing with double glazing", "glazing level <= mostly double",
         "space_heating", "10% (single) / 7% (partial) / 4% (mostly double) of space heating", "brief 8-12%"),
        ("smart_controls", "Smart thermostat / zoned heating controls", "controls below zone control AND gas or electric heating",
         "space_heating", "~6% of space heating, scaled by behaviour (0.5-1.8x)", "brief 5-10%"),
        ("heat_pump", "Air source heat pump (space heating + hot water)", "house or bungalow AND gas/electric heating AND not already a heat pump",
         "fuel_switch", "gas heating removed; electricity += useful heat / SCOP 2.8 (DHW 2.5)", "Electrification of Heat demonstration SCOP ~2.8 [approx]"),
        ("condensing_boiler", "Replace non-condensing gas boiler", "gas boiler rated Average/Poor on EPC",
         "heating_energy", "15% of boiler gas (efficiency 0.72 -> 0.85)", "NEED condensing boiler median ~8% of gas [approx]"),
        ("solar_pv", "Solar PV, 2.5 kWp", "house or bungalow AND pitched/flat roof AND no existing PV",
         "grid_import", "generation 2.5 kWp x regional yield; 45% self-consumed reduces grid import", "PVGIS-style yields [approx]; brief 20-35%"),
    ]
    rows = []
    for rid, name, rule, target, impact, src in spec:
        lo, hi = _cost_range(recs.loc[recs["mapped_retrofit"] == rid, "indicative_cost"])
        rows.append({"retrofit_id": rid, "name": name, "applicability_rule": rule, "impact_target": target,
                     "impact_model": impact, "impact_source": src, "indicative_cost_low_gbp": lo, "indicative_cost_high_gbp": hi,
                     "cost_source": "median of EPC recommendation indicative_cost for mapped measures (2025-26 certificates)" if not np.isnan(lo) else "not in EPC recommendations"})
    cat = pd.DataFrame(rows)
    order = {r: i for i, r in enumerate(["loft_insulation", "cavity_wall_insulation", "solid_wall_insulation", "floor_insulation",
                                         "double_glazing", "smart_controls", "heat_pump", "condensing_boiler", "solar_pv"])}
    cat["fabric_first_order"] = cat["retrofit_id"].map(order) + 1
    return cat


def emissions_factors():
    x = pd.read_excel(RAW / "desnz_ghg/ghg-conversion-factors-2025-flat-format.xlsx", sheet_name="Factors by Category", header=None)
    hdr = x.index[x.apply(lambda r: r.astype(str).str.fullmatch("Scope").any(), axis=1)][0]
    x.columns = x.iloc[hdr]
    x = x.iloc[hdr + 1:]
    x = x[x["GHG/Unit"] == "kg CO2e"]

    def get(l3, uom, l1=None):
        q = x[(x["Level 3"] == l3) & (x["UOM"] == uom)]
        if l1:
            q = q[q["Level 1"] == l1]
        return float(q["GHG Conversion Factor 2025"].iloc[0])

    gen = get("Electricity: UK", "kWh", "UK electricity")
    td = get("Electricity: UK", "kWh", "Transmission and distribution")
    rows = [
        ("electricity", gen + td, "kg CO2e/kWh", "UK electricity generated (Scope 2) + T&D losses (Scope 3)", gen, td),
        ("gas", get("Natural gas", "kWh (Gross CV)", "Fuels"), "kg CO2e/kWh", "Natural gas, gross CV (Scope 1)", None, None),
        ("burning_oil", get("Burning oil", "kWh (Gross CV)", "Fuels"), "kg CO2e/kWh", "Burning oil, gross CV", None, None),
        ("lpg", get("LPG", "kWh (Gross CV)", "Fuels"), "kg CO2e/kWh", "LPG, gross CV", None, None),
    ]
    df = pd.DataFrame(rows, columns=["fuel", "kg_co2e_per_kwh", "unit", "scope_note", "generation_component", "td_component"])
    df["source"] = "DESNZ Greenhouse gas reporting: conversion factors 2025 (flat file), OGL"
    df["year"] = 2025
    return df


# ------------------------------------------------------------------ run
def run(allc, homes, props, comp, hid, seed):
    t = time.time()
    log = {}
    crosswalk = pd.read_parquet(HIDDEN / "crosswalk_uprn_address.parquet")
    props, sales_hist, (b, se) = build_sales_and_value(props, allc, crosswalk, seed, log)

    lr, lp, seq = simulate_retrofits(props, comp, hid)
    recs = epc_recommendations(crosswalk)
    rec_set = set(zip(recs["property_id"], recs["mapped_retrofit"].fillna("")))
    lr["epc_recommended"] = [(pid, r) in rec_set for pid, r in zip(lr["property_id"], lr["retrofit_id"])]
    lr["epc_recommendation_available"] = lr["property_id"].isin(set(recs["property_id"]))

    # Value labels: real-sales rating premium x (EPC potential SAP - current SAP)
    dsap = (props["potential_sap"] - props["sap_score"]).clip(lower=0)
    mid = np.exp(b * dsap / 10) - 1
    lo, hi = np.exp((b - 1.96 * se) * dsap / 10) - 1, np.exp((b + 1.96 * se) * dsap / 10) - 1
    lv = pd.DataFrame({"property_id": props["property_id"], "rating_before": props["energy_rating"], "sap_before": props["sap_score"],
                       "rating_after": props["potential_rating"], "sap_after": props["potential_sap"],
                       "uplift_pct_low": (100 * np.minimum(lo, hi)).round(2), "uplift_pct_mid": (100 * mid).round(2),
                       "uplift_pct_high": (100 * np.maximum(lo, hi)).round(2)})
    lv["uplift_gbp_low"] = (props["current_value_estimate"] * lv["uplift_pct_low"] / 100).round(-2)
    lv["uplift_gbp_high"] = (props["current_value_estimate"] * lv["uplift_pct_high"] / 100).round(-2)
    lv["basis"] = "rating premium fitted on real sales with known rating at sale (associational); rating_after = EPC potential rating"

    _write(props, "properties")
    _write(sales_hist, "sales_history")
    _write(lr, "labels_retrofit")
    _write(lp, "labels_package")
    _write(seq, "labels_package_sequence")
    _write(lv, "labels_value")
    _write(recs, "epc_recommendations")
    _write(retrofit_catalogue(recs), "retrofit_catalogue")
    _write(emissions_factors(), "emissions_factors")
    log["labels"] = {"homes_with_improvement_potential": int(lp["improvement_potential_pct"].notna().sum()),
                     "improvement_potential_median_pct": round(float(lp["improvement_potential_pct"].median()), 2),
                     "feasible_by_retrofit": lr.groupby("retrofit_id")["feasible"].sum().astype(int).to_dict()}
    (OUT / "build_log.json").write_text(json.dumps(log, indent=2, default=str))
    print(json.dumps(log["labels"], indent=1))
    print(f"stage B done ({time.time() - t:.0f}s)")

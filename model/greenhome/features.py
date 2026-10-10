"""Load dataset/ parquet files, annualise metered usage (degree-day weighted, NaN-aware) and build the master table."""
import numpy as np
import pandas as pd
from . import config as C

P_COLS = None  # all property columns are kept


def _hdd_share():
    h = pd.read_parquet(C.DATA / "monthly_hdd.parquet")[["climate_region", "month", "hdd"]]
    h["year_id"] = h.month.str[:4].astype(int) - (h.month.str[5:7].astype(int) < 10)   # Oct-Sep year
    h["share"] = h.hdd / h.groupby(["climate_region", "year_id"]).hdd.transform("sum")
    return h[["climate_region", "month", "share"]]


def annualise(usage: pd.DataFrame, props: pd.DataFrame) -> pd.DataFrame:
    """annual_f = sum(observed_f) / sum(w_t over observed months), w_t = (1-hs)/12 + hs * HDD-share_t.
    All 24 months used: with every month observed sum(w)=2 so this is the two-year mean.
    Unavailable (NaN) if < MIN_MONTHS observed or no Dec-Feb month. NaN is never treated as zero."""
    u = usage.merge(props[["property_id", "climate_region", "heating_fuel"]], on="property_id") \
             .merge(_hdd_share(), on=["climate_region", "month"], how="left")
    u["share"] = u.share.fillna(1 / 12)
    mnum = u.month.str[5:7].astype(int)
    elec_heating = u.heating_fuel.isin(["elec"])
    hs = {"electricity_kwh": np.where(elec_heating, C.HEAT_SHARE["elec_heating"], C.HEAT_SHARE["elec_other"]),
          "gas_kwh": C.HEAT_SHARE["gas"], "heat_network_kwh": C.HEAT_SHARE["heat_network"],
          "other_fuel_kwh": C.HEAT_SHARE["other"]}
    out = {}
    for col, name in (("electricity_kwh", "elec"), ("gas_kwh", "gas"), ("heat_network_kwh", "heat_network"), ("other_fuel_kwh", "other_fuel")):
        w = (1 - hs[col]) / 12 + hs[col] * u.share
        obs = u[col].notna()
        g = pd.DataFrame({"pid": u.property_id, "v": u[col].where(obs, 0.0), "w": w.where(obs, 0.0), "n": obs.astype(int),
                          "winter": (obs & mnum.isin(C.WINTER_MONTHS)).astype(int)}).groupby("pid").sum()
        ok = (g.n >= C.MIN_MONTHS) & (g.winter > 0)
        out[f"{name}_annual"] = (g.v / g.w).where(ok)
        out[f"{name}_months"] = g.n
    a = pd.DataFrame(out)
    a["usage_status"] = np.where(a.elec_annual.notna() & a.gas_annual.notna(), "metered", "unavailable")
    return a


TWIN_MIN_MONTHS = 8       # fewer observed months -> the fit is not trusted and the features are NaN (never guessed)
TWIN_COLS = ["g_slope", "g_base", "g_r2", "g_summer", "g_winter", "g_win_sum", "e_slope", "e_base", "e_r2", "e_summer", "e_winter", "e_win_sum",
             "g_slope_m2", "g_slope_vs_epc", "e_slope_m2"]


def _fit_line(u: pd.DataFrame, col: str, pre: str) -> pd.DataFrame:
    """Per-home least-squares fit of monthly use against heating degree days: use = base + slope * HDD.
    slope = how fast heating use rises as it gets colder (the home's effective heat-loss response, which reflects its true insulation AND the
    household's thermostat setting); base = weather-independent load (hot water, cooking, appliances). Summer/winter means and their ratio
    summarise the same seasonal shape. NaN months are skipped, never treated as zero; < TWIN_MIN_MONTHS observed -> all NaN."""
    d = u.dropna(subset=[col, "hdd"]).copy(); g = d.groupby("property_id")
    n = g[col].size(); mx = g.hdd.mean(); my = g[col].mean()
    d["dx"] = d.hdd - d.property_id.map(mx); d["dy"] = d[col] - d.property_id.map(my)
    sxy = (d.dx * d.dy).groupby(d.property_id).sum(); sxx = (d.dx ** 2).groupby(d.property_id).sum(); syy = (d.dy ** 2).groupby(d.property_id).sum()
    slope = sxy / sxx.replace(0, np.nan); icpt = my - slope * mx; r2 = (sxy ** 2) / (sxx * syy).replace(0, np.nan)
    mon = d.month.str[5:7]
    summer = d[mon.isin(["06", "07", "08"])].groupby("property_id")[col].mean(); winter = d[mon.isin(["12", "01", "02"])].groupby("property_id")[col].mean()
    out = pd.DataFrame({f"{pre}_slope": slope, f"{pre}_base": icpt, f"{pre}_r2": r2, f"{pre}_summer": summer, f"{pre}_winter": winter})
    out[f"{pre}_win_sum"] = out[f"{pre}_winter"] / out[f"{pre}_summer"].replace(0, np.nan)
    out.loc[n[n < TWIN_MIN_MONTHS].index, :] = np.nan
    return out


def twin_features(usage: pd.DataFrame, props: pd.DataFrame) -> pd.DataFrame:
    """Monthly-shape features per home (index = property_id), from `energy_usage` and `monthly_hdd`. See _fit_line."""
    h = pd.read_parquet(C.DATA / "monthly_hdd.parquet")[["climate_region", "month", "hdd"]]
    u = usage[["property_id", "month", "electricity_kwh", "gas_kwh"]].merge(props[["property_id", "climate_region"]], on="property_id").merge(h, on=["climate_region", "month"], how="left")
    T = pd.concat([_fit_line(u, "gas_kwh", "g"), _fit_line(u, "electricity_kwh", "e")], axis=1)
    pr = props.set_index("property_id"); T = T.reindex(pr.index)
    T["g_slope_m2"] = T.g_slope / pr.floor_area; T["g_slope_vs_epc"] = T.g_slope / (pr.epc_heating_cost_current + 1); T["e_slope_m2"] = T.e_slope / pr.floor_area
    return T[TWIN_COLS].replace([np.inf, -np.inf], np.nan)



def _tidy(p: pd.DataFrame) -> pd.DataFrame:
    p = p.copy()
    p["has_solar_pv"] = p.has_solar_pv.map({True: True, False: False})          # None stays NaN (unknown)
    p["boiler_condensing"] = p.boiler_condensing.map({True: True, False: False})
    for c in ["property_type", "built_form", "age_band", "wall_type", "heating_detail", "climate_region", "outcode", "tenure",
              "local_authority", "roof_type", "floor_type"]:
        p[c] = p[c].astype("category")
    return p


def build_master(refresh=False) -> pd.DataFrame:
    f = C.CACHE / "master.parquet"
    if f.exists() and not refresh:
        return pd.read_parquet(f)
    C.CACHE.mkdir(parents=True, exist_ok=True)
    p = pd.read_parquet(C.DATA / "properties.parquet")
    sp = pd.read_parquet(C.DATA / "splits.parquet")[["property_id", "split"]]
    usage = pd.read_parquet(C.DATA / "energy_usage.parquet")
    ann = annualise(usage, p); tw = twin_features(usage, p)
    df = p.merge(sp, on="property_id").merge(ann, left_on="property_id", right_index=True, how="left").merge(tw, left_on="property_id", right_index=True, how="left")
    df["usage_status"] = df.usage_status.fillna("unavailable")
    d = df[["elec_annual", "gas_annual", "heat_network_annual", "other_fuel_annual"]].fillna(0)
    ok = (df.usage_status == "metered") & df.floor_area.between(*C.FAULT_FLOOR_AREA)
    # intensity = metered DELIVERED energy per m2 (all fuels); purchased (grid+gas) is used for savings accounting
    df["intensity"] = np.where(ok, d.sum(axis=1) / df.floor_area, np.nan)
    df["purchased_kwh"] = np.where(df.usage_status == "metered", df.elec_annual + df.gas_annual, np.nan)
    df.to_parquet(f)
    return df

"""Steps 5-7: hidden per-home state, EPC-anchored annual energy, DESNZ postcode anchoring,
monthly series, and logged fault injection.

Chain for each home (all documented in DATA.md):
  EPC costs -> delivered kWh per end use and fuel (SAP prices), reconciled to the EPC's own
  primary energy (SAP PEFs)                                   = RdSAP-modelled demand
  x performance gap by band (Few et al. 2023)                 = typical metered level
  x hidden behaviour (setpoint, occupancy, vacancy, true fabric for "(assumed)" walls)
  + appliances / cooking (not in SAP)
  x partial pooling toward the real DESNZ 2024 postcode median (gas and electricity)
  -> monthly via regional HDD (Met Office HadUK-Grid) and seasonal base-load curves
  - solar self-consumption (generation stored separately)
  -> fault injection (NaN rows, gaps, short histories, PV contradiction), every fault logged
"""
import numpy as np
import pandas as pd

from . import constants as K
from .paths import RAW


# ------------------------------------------------------------------ degree days
def monthly_hdd():
    rows = []
    for reg in sorted(set(K.LA_CLIMATE_REGION.values())):
        lines = open(RAW / f"metoffice/Tmean_{reg}.txt").read().splitlines()
        hdr = next(i for i, l in enumerate(lines) if l.startswith("year"))
        for l in lines[hdr + 1:]:
            parts = l.split()
            yr = int(parts[0])
            if yr < 1991:
                continue
            for m in range(12):
                try:
                    t = float(parts[1 + m])
                except (IndexError, ValueError):
                    continue
                days = pd.Period(f"{yr}-{m + 1:02d}").days_in_month
                d = K.HDD_BASE_C - t
                hdd = days * d / (1 - np.exp(-K.HITCHIN_K * d)) if abs(d) > 1e-6 else days / K.HITCHIN_K
                rows.append({"climate_region": reg, "month": f"{yr}-{m + 1:02d}", "tmean_c": t, "hdd": round(hdd, 1)})
    df = pd.DataFrame(rows)
    df["source"] = "Met Office HadUK-Grid regional monthly mean temperature; HDD via Hitchin (1983), base 15.5C, k=0.71"
    return df


# ------------------------------------------------------------------ helpers
def _price(fuel, offpeak):
    if fuel == "elec":
        return np.where(offpeak, K.PRICE_P_PER_KWH["elec_offpeak"], K.PRICE_P_PER_KWH["elec"])
    return K.PRICE_P_PER_KWH.get(fuel, K.PRICE_P_PER_KWH["gas"])


def epc_delivered(p):
    """Delivered kWh/yr per end use from EPC costs, reconciled to EPC primary energy."""
    dual = p["energy_tariff"].fillna("").str.contains("dual|off-peak", case=False)
    heat_off = dual & p["heating_detail"].eq("electric_storage")
    hw_off = p["hot_water_offpeak"].fillna(False) | (dual & p["hot_water_fuel"].eq("elec"))
    heat = np.zeros(len(p))
    hw = np.zeros(len(p))
    for f in ["gas", "elec", "oil", "lpg", "solid", "heat_network"]:
        mh = p["heating_fuel"].eq(f).values
        heat[mh] = p["epc_heating_cost_current"].values[mh] * 100 / np.broadcast_to(_price(f, heat_off.values), len(p))[mh]
        mw = p["hot_water_fuel"].eq(f).values
        hw[mw] = p["epc_hot_water_cost_current"].values[mw] * 100 / np.broadcast_to(_price(f, hw_off.values), len(p))[mw]
    light = p["epc_lighting_cost_current"].values * 100 / K.PRICE_P_PER_KWH["elec"]
    pef_h = p["heating_fuel"].map(K.PEF).fillna(K.PEF["elec"]).values
    pef_w = p["hot_water_fuel"].map(K.PEF).fillna(K.PEF["elec"]).values
    implied = heat * pef_h + hw * pef_w + light * K.PEF["elec"]
    target = p["epc_primary_kwh_m2"].values * p["floor_area"].values
    k = target / np.where(implied > 0, implied, np.nan)
    # Magnitude always comes from the EPC primary-energy figure; costs only set the split
    # between end uses and fuels (SAP prices differ from today's, so costs alone mis-scale).
    # PV homes: EPC primary is net of PV generation, so it under-states demand slightly [documented].
    ok = np.isfinite(k) & (k > 0)
    k = np.where(ok, k, 1.0)
    return pd.DataFrame({"epc_heat_kwh": heat * k, "epc_hw_kwh": hw * k, "epc_light_kwh": light * k,
                         "epc_reconcile_factor": k, "epc_reconciled": ok}, index=p.index)


# ------------------------------------------------------------------ annual model
def simulate_annual(p, rng):
    n = len(p)
    d = epc_delivered(p)
    hid = pd.DataFrame({"property_id": p["property_id"].values})
    hid["setpoint_c"] = np.clip(rng.normal(K.SETPOINT_MEAN_C, K.SETPOINT_SD_C, n), 16, 24).round(1)
    hid["occupancy_mult"] = np.exp(rng.normal(0, K.OCC_SD, n))
    hid["appliance_mult"] = np.exp(rng.normal(0, K.APPLIANCE_SD, n))
    hid["vacant"] = rng.random(n) < K.VACANT_SHARE
    assumed_none = (p["wall_assumed"] & p["wall_insulation"].eq("none")).values
    hid["true_wall_insulated_despite_epc"] = assumed_none & (rng.random(n) < K.ASSUMED_WALL_ACTUALLY_INSULATED)
    hid["gas_cooking"] = (p["heating_fuel"].eq("gas") | p["hot_water_fuel"].eq("gas")).values & (rng.random(n) < K.GAS_COOKING_SHARE)

    gap = p["energy_rating"].map(K.GAP_BY_BAND).fillna(0.85).values
    setp = 1 + K.HEAT_PER_DEGREE * (hid["setpoint_c"].values - K.SETPOINT_MEAN_C)
    fabric = np.where(hid["true_wall_insulated_despite_epc"], K.ASSUMED_WALL_INSULATED_HEAT_MULT, 1.0)
    vac = np.where(hid["vacant"], K.VACANT_MULT, 1.0)
    noise = np.exp(rng.normal(0, K.ANNUAL_NOISE_SD, n))
    occ = hid["occupancy_mult"].values
    heat = d["epc_heat_kwh"].values * gap * setp * fabric * occ ** 0.3 * vac * noise
    hw = d["epc_hw_kwh"].values * K.GAP_HOT_WATER * occ * vac
    light = d["epc_light_kwh"].values * occ ** 0.5 * vac
    appl = K.APPLIANCE_BASE_KWH * (p["floor_area"].clip(15, 400).values / 80) ** K.APPLIANCE_AREA_EXP * hid["appliance_mult"].values * occ ** 0.4 * vac
    cook = np.where(hid["gas_cooking"], K.GAS_COOKING_KWH * occ * vac, 0.0)

    hf, wf = p["heating_fuel"].to_numpy(object), p["hot_water_fuel"].to_numpy(object)
    comp = pd.DataFrame({"property_id": p["property_id"].values,
                         "space_heat_kwh": heat, "hot_water_kwh": hw, "lighting_kwh": light,
                         "appliance_kwh": appl, "gas_cooking_kwh": cook,
                         "heating_fuel": hf, "hot_water_fuel": wf})
    comp["gas_kwh"] = np.where(hf == "gas", heat, 0) + np.where(wf == "gas", hw, 0) + cook
    comp["elec_demand_kwh"] = light + appl + np.where(hf == "elec", heat, 0) + np.where(wf == "elec", hw, 0) \
        + np.where(hf == "unknown", heat, 0)
    comp["heat_network_kwh"] = np.where(hf == "heat_network", heat, 0) + np.where(wf == "heat_network", hw, 0)
    comp["other_fuel_kwh"] = np.where(np.isin(hf, ["oil", "lpg", "solid"]), heat, 0) + np.where(np.isin(wf, ["oil", "lpg", "solid"]), hw, 0)
    return comp, hid, d


def desnz_anchor(p, comp):
    """Partially pool each home's annual gas/electricity toward the real DESNZ 2024 postcode median."""
    info = {}
    for fuel, fname, col in [("gas", "Postcode_level_gas_2024.csv", "gas_kwh"),
                             ("elec", "Postcode_level_all_meters_electricity_2024.csv", "elec_demand_kwh")]:
        dz = pd.read_csv(RAW / f"desnz/{fname}")
        dz["Postcode"] = dz["Postcode"].str.upper().str.strip()
        pc_med = dz[dz["Postcode"] != "ALL POSTCODES"].set_index("Postcode")["Median_cons_kwh"]
        oc_med = dz[dz["Postcode"] == "ALL POSTCODES"].set_index("Outcode")["Median_cons_kwh"]
        v = comp[col].values
        users = v > 0
        df = pd.DataFrame({"postcode": p["postcode"].values, "outcode": p["outcode"].values, "v": v})[users]
        oc_sim = df.groupby("outcode")["v"].median()
        pc_sim = df.groupby("postcode")["v"].agg(["median", "size"])
        r_oc = (df["outcode"].map(oc_med) / df["outcode"].map(oc_sim)).clip(0.4, 2.5)
        r_pc = (df["postcode"].map(pc_med) / df["postcode"].map(pc_sim["median"])).clip(0.4, 2.5)
        npc = df["postcode"].map(pc_sim["size"])
        w = npc / (npc + K.DESNZ_SHRINK_N)
        log_r = np.log(r_oc.fillna(1.0)) + np.where(r_pc.notna() & r_oc.notna(), w * (np.log(r_pc) - np.log(r_oc)), 0.0)
        scale = np.exp(K.DESNZ_POOL_EXP * log_r)
        full = np.ones(len(comp))
        full[users] = scale
        comp[f"desnz_scale_{fuel}"] = full
        comp[f"desnz_{fuel}_postcode_median"] = p["postcode"].map(pc_med).values
        info[fuel] = {"homes_with_postcode_median": int(df["postcode"].map(pc_med).notna().sum()),
                      "homes_with_outcode_median": int(df["outcode"].map(oc_med).notna().sum()), "users": int(users.sum())}
    # apply: gas scale to gas end uses; elec scale to electricity end uses
    g, e = comp["desnz_scale_gas"].values, comp["desnz_scale_elec"].values
    hf, wf = comp["heating_fuel"].to_numpy(object), comp["hot_water_fuel"].to_numpy(object)
    for c in ["space_heat_kwh", "hot_water_kwh"]:
        fuel = hf if c == "space_heat_kwh" else wf
        comp[c] = comp[c] * np.where(fuel == "gas", g, np.where(fuel == "elec", e, 1.0))
    comp["gas_cooking_kwh"] *= g
    comp["lighting_kwh"] *= e
    comp["appliance_kwh"] *= e
    comp["gas_kwh"] *= g
    comp["elec_demand_kwh"] *= e
    return comp, info


def add_solar(p, comp, rng):
    kwp = p["solar_kwp_est"].fillna(0).values
    yld = p["climate_region"].map(K.PV_YIELD).fillna(780).values
    gen = kwp * yld
    fault = (kwp > 0) & (rng.random(len(p)) < K.PV_FAULT_SHARE)  # EPC says PV, meter shows none
    gen = np.where(fault, 0.0, gen)
    selfc = np.minimum(K.PV_SELF_CONSUMPTION * gen, 0.5 * comp["elec_demand_kwh"].values)
    comp["solar_generation_kwh"] = gen
    comp["solar_self_consumed_kwh"] = selfc
    comp["grid_import_kwh"] = comp["elec_demand_kwh"] - selfc
    comp["pv_contradiction_fault"] = fault
    return comp


# ------------------------------------------------------------------ monthly
def monthly(p, comp, hdd, rng):
    months = pd.period_range(K.MONTHS_START, K.MONTHS_END, freq="M").astype(str)
    hdd_w = hdd.pivot(index="climate_region", columns="month", values="hdd")
    reg = p["climate_region"].to_numpy(object)
    H = hdd_w.loc[reg, months].values                       # homes x months
    H_ref = H.mean(axis=1, keepdims=True) * 12              # mean annual HDD over the 24 months
    heat_share = H / H_ref
    mi = np.array([int(m[5:]) for m in months])
    cos = np.cos(2 * np.pi * (mi - 1) / 12)                 # peaks in January
    hw_share = (1 + 0.12 * cos) / 12
    light_share = (1 + 0.35 * cos) / 12
    appl_share = (1 + 0.10 * cos) / 12
    pv_share = np.array([K.PV_MONTHLY_SHARE[m - 1] for m in mi])
    pv_share = pv_share / pv_share.reshape(2, 12).sum(axis=1).mean()

    c = comp
    hf, wf = c["heating_fuel"].to_numpy(object)[:, None], c["hot_water_fuel"].to_numpy(object)[:, None]
    heat_m = c["space_heat_kwh"].values[:, None] * heat_share
    hw_m = c["hot_water_kwh"].values[:, None] * hw_share
    light_m = c["lighting_kwh"].values[:, None] * light_share
    appl_m = c["appliance_kwh"].values[:, None] * appl_share
    cook_m = c["gas_cooking_kwh"].values[:, None] / 12
    gen_m = c["solar_generation_kwh"].values[:, None] * pv_share
    gas_m = np.where(hf == "gas", heat_m, 0) + np.where(wf == "gas", hw_m, 0) + cook_m
    elec_m = light_m + appl_m + np.where((hf == "elec") | (hf == "unknown"), heat_m, 0) + np.where(wf == "elec", hw_m, 0)
    selfc_m = np.minimum(K.PV_SELF_CONSUMPTION * gen_m, 0.5 * elec_m)
    imp_m = elec_m - selfc_m
    hn_m = np.where(hf == "heat_network", heat_m, 0) + np.where(wf == "heat_network", hw_m, 0)
    of_m = np.where(np.isin(hf, ["oil", "lpg", "solid"]), heat_m, 0) + np.where(np.isin(wf, ["oil", "lpg", "solid"]), hw_m, 0)
    nz = lambda: np.exp(rng.normal(0, K.MONTHLY_NOISE_SD, gas_m.shape))
    gas_m, imp_m, hn_m, of_m = gas_m * nz(), imp_m * nz(), hn_m * nz(), of_m * nz()
    gen_m = gen_m * np.exp(rng.normal(0, 0.08, gen_m.shape))

    # ---- fault injection (logged)
    n, T = gas_m.shape
    miss = rng.random((n, T)) < K.FAULT_MISSING_MONTH_P
    faults = []
    long_gap = rng.random(n) < K.FAULT_LONG_GAP_SHARE
    for i in np.where(long_gap)[0]:
        L = rng.integers(3, 9)
        s = rng.integers(0, T - L)
        miss[i, s:s + L] = True
        faults.append({"property_id": p["property_id"].iat[i], "fault": "long_gap", "detail": f"months {months[s]}..{months[s + L - 1]} missing"})
    short = (~long_gap) & (rng.random(n) < K.FAULT_SHORT_HISTORY_SHARE)
    for i in np.where(short)[0]:
        keep = rng.integers(2, 6)
        miss[i, : T - keep] = True
        faults.append({"property_id": p["property_id"].iat[i], "fault": "short_history", "detail": f"only last {keep} months present (summer months, below the 6-month threshold)"})
    for i in np.where(miss.any(axis=1) & ~long_gap & ~short)[0]:
        faults.append({"property_id": p["property_id"].iat[i], "fault": "missing_months", "detail": f"{int(miss[i].sum())} random months missing"})
    for i in np.where(c["pv_contradiction_fault"].values)[0]:
        faults.append({"property_id": p["property_id"].iat[i], "fault": "pv_contradiction", "detail": "EPC records solar PV but no generation in meter data"})
    for arr in (gas_m, imp_m, hn_m, of_m, gen_m):
        arr[miss] = np.nan

    pid = np.repeat(p["property_id"].values, T)
    eu = pd.DataFrame({
        "property_id": pid, "month": np.tile(months, n),
        "electricity_kwh": imp_m.ravel().round(1), "gas_kwh": gas_m.ravel().round(1),
        "heat_network_kwh": hn_m.ravel().round(1), "other_fuel_kwh": of_m.ravel().round(1),
        "solar_generation_kwh": gen_m.ravel().round(1)})
    # Zero means "no such supply", NaN means "missing reading": keep zeros only where the home has no supply
    eu["source"] = "simulated"
    return eu, pd.DataFrame(faults)

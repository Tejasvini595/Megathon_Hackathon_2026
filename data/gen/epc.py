"""Step 1-4: load EPC certificates, filter, de-duplicate, parse, add geography and fuel scope."""
import hashlib

import duckdb
import numpy as np
import pandas as pd

from . import parse as P
from .constants import GEO_TEST_LA, KWP_CAP, KWP_PER_M2_PANEL, LA_CLIMATE_REGION, ROOF_PITCH_FACTOR
from .paths import RAW

NUM = ["current_energy_efficiency", "potential_energy_efficiency", "energy_consumption_current",
       "energy_consumption_potential", "co2_emissions_current", "co2_emissions_potential", "heating_cost_current",
       "hot_water_cost_current", "lighting_cost_current", "heating_cost_potential", "hot_water_cost_potential",
       "lighting_cost_potential", "total_floor_area", "number_habitable_rooms", "number_heated_rooms",
       "photo_supply", "multi_glaze_proportion", "low_energy_lighting", "extension_count", "number_open_fireplaces",
       "floor_height"]


def load_all_certs():
    """All certificates (every lodgement), used for retrofit history and rating-at-sale."""
    con = duckdb.connect()
    df = con.sql(f"select * from read_csv('{RAW}/epc/batch2/certificates.csv', all_varchar=true)").df()
    for c in NUM:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df["lodgement_date"] = pd.to_datetime(df["lodgement_date"])
    df["uprn"] = df["uprn"].replace("", np.nan)
    return df.sort_values("certificate_number").reset_index(drop=True)  # deterministic order


def select_homes(allc):
    """Existing dwellings (RdSAP, not new dwelling), latest certificate per UPRN."""
    ex = allc[(allc["report_type"] == "2") & (allc["transaction_type"] != "New dwelling")].copy()
    ex["home_key"] = ex["uprn"].fillna("CERT-" + ex["certificate_number"])
    ex = ex.sort_values(["home_key", "lodgement_datetime", "certificate_number"]).drop_duplicates("home_key", keep="last")
    return ex.reset_index(drop=True)


def property_id(home_key):
    return "P" + hashlib.sha1(("ght-" + home_key).encode()).hexdigest()[:10].upper()


def _apply_unique(series, fn, *extra):
    """Apply a parser to the distinct values of one or more columns and map back."""
    if extra:
        keys = pd.MultiIndex.from_arrays([series.fillna("")] + [e.fillna("") for e in extra])
        uniq = keys.unique()
        m = {k: fn(*k) for k in uniq}
        return pd.DataFrame([m[k] for k in keys], index=series.index), m
    uniq = series.fillna("").unique()
    m = {k: fn(k) for k in uniq}
    return pd.DataFrame([m[k] for k in series.fillna("")], index=series.index), m


def build_properties(homes):
    h = homes
    lookups = []
    walls, m = _apply_unique(h["walls_description"], P.parse_wall)
    lookups += [("walls_description", k, v) for k, v in m.items()]
    roof, m = _apply_unique(h["roof_description"], P.parse_roof)
    lookups += [("roof_description", k, v) for k, v in m.items()]
    win, m = _apply_unique(h["windows_description"], P.parse_windows)
    lookups += [("windows_description", k, v) for k, v in m.items()]
    flo, m = _apply_unique(h["floor_description"], P.parse_floor)
    lookups += [("floor_description", k, v) for k, v in m.items()]
    heat, m = _apply_unique(h["mainheat_description"], P.parse_heating, h["main_fuel"], h["mainheat_energy_eff"])
    lookups += [("mainheat_description|main_fuel|mainheat_energy_eff", "|".join(k), v) for k, v in m.items()]
    ctl, m = _apply_unique(h["mainheatcont_description"], P.parse_controls)
    lookups += [("mainheatcont_description", k, v) for k, v in m.items()]
    heat["heating_fuel"] = heat["heating_detail"].map(P.heating_fuel)
    hw, m = _apply_unique(h["hotwater_description"], P.parse_hotwater, heat["heating_fuel"])
    lookups += [("hotwater_description|heating_fuel", "|".join(k), v) for k, v in m.items()]

    p = pd.DataFrame({"property_id": h["home_key"].map(property_id)})
    p["customer_id"] = "C" + p["property_id"].str[1:]          # one customer per home [design]
    p["postcode"] = h["postcode"].str.upper().str.strip()
    p["outcode"] = p["postcode"].str.split().str[0]
    p["local_authority"] = h["local_authority_label"]
    p["local_authority_code"] = h["local_authority"]
    p["constituency"] = h["constituency_label"]
    p["region_code"] = h["region"]
    p["country"] = h["country"]
    p["climate_region"] = p["local_authority"].map(LA_CLIMATE_REGION)
    p["property_type"] = h["property_type"]
    p["built_form"] = h["built_form"].replace({"Not Recorded": "unknown", "None": "unknown", "": "unknown"}).fillna("unknown")
    ab = h["construction_age_band"].map(P.AGE_BANDS)
    p["age_band"] = ab.str[0]
    p["age_year_est"] = ab.str[1]
    p["floor_area"] = h["total_floor_area"]
    p["habitable_rooms"] = h["number_habitable_rooms"]
    p["bedrooms_est"] = (h["number_habitable_rooms"] - 1).clip(lower=1)
    p["floor_level"] = h["floor_level"].map(P.parse_floor_level)
    p["flat_top_storey"] = h["flat_top_storey"].map({"Y": True, "N": False})
    p["storeys_est"] = np.select(
        [p["property_type"].eq("Bungalow"), p["property_type"].eq("Flat"), p["property_type"].eq("Maisonette"),
         p["floor_area"] > 200], [1, 1, 2, 3], 2)
    p["sap_score"] = h["current_energy_efficiency"]
    p["energy_rating"] = h["current_energy_rating"]
    p["potential_sap"] = h["potential_energy_efficiency"]
    p["potential_rating"] = h["potential_energy_rating"]
    p["epc_primary_kwh_m2"] = h["energy_consumption_current"]
    p["epc_primary_kwh_m2_potential"] = h["energy_consumption_potential"]
    p["epc_co2_t"] = h["co2_emissions_current"]
    p = pd.concat([p, heat[["heating", "heating_detail", "heating_fuel", "boiler_condensing", "heating_assumed"]],
                   hw[["hot_water_source", "hot_water_fuel", "hot_water_offpeak"]]], axis=1)
    p["main_fuel"] = h["main_fuel"]
    p["mains_gas_flag"] = h["mains_gas_flag"].map({"Y": True, "N": False})
    p["energy_tariff"] = h["energy_tariff"]
    p = pd.concat([p, walls[["wall_type", "wall_insulation", "wall_assumed"]],
                   roof[["roof_type", "roof_insulation", "loft_mm", "roof_assumed"]],
                   flo[["floor_type", "floor_insulation"]], win[["glazing", "glazing_level"]],
                   ctl[["controls_level", "controls_label"]]], axis=1)
    p["wall_insulation_level"] = p["wall_insulation"].map(P.WALL_INS_LEVEL)
    p["loft_depth_known"] = p["loft_mm"].notna()
    p["smart_controls"] = p["controls_level"].eq(3)  # best EPC controls class; EPC has no smart-thermostat field
    # Solar: real EPC fields, blank photo_supply = unknown (not "no")
    p["photo_supply_pct"] = h["photo_supply"]
    p["has_solar_pv"] = np.where(h["photo_supply"].isna(), None, h["photo_supply"] > 0)
    footprint = p["floor_area"] / p["storeys_est"]
    p["solar_kwp_est"] = np.where(h["photo_supply"] > 0,
                                  (h["photo_supply"] / 100 * footprint * ROOF_PITCH_FACTOR * KWP_PER_M2_PANEL).clip(upper=KWP_CAP).round(2),
                                  np.where(h["photo_supply"].isna(), np.nan, 0.0))
    p["solar_water_heating"] = h["solar_water_heating_flag"].map({"Y": True, "N": False})
    p["mechanical_ventilation"] = h["mechanical_ventilation"]
    p["open_fireplaces"] = h["number_open_fireplaces"]
    p["low_energy_lighting_pct"] = h["low_energy_lighting"]
    p["tenure"] = h["tenure"].replace({"": "unknown", "Not defined - use in the case of a new dwelling for which the intended tenure in not known. It is not to be used for an existing dwelling": "unknown"}).fillna("unknown")
    p["transaction_type"] = h["transaction_type"]
    p["lodgement_date"] = h["lodgement_date"].dt.date.astype(str)
    p["inspection_date"] = h["inspection_date"]
    # Original EPC descriptions kept verbatim (for LLM/Jev parsing evaluation)
    for c in ["walls_description", "roof_description", "floor_description", "windows_description",
              "mainheat_description", "mainheatcont_description", "hotwater_description", "secondheat_description",
              "lighting_description"]:
        p["epc_" + c] = h[c]
    # EPC cost fields: needed by the energy simulator (kept for transparency)
    for c in ["heating_cost_current", "hot_water_cost_current", "lighting_cost_current"]:
        p["epc_" + c] = h[c]

    # Fuel scope: which accounting the brief's purchased-energy metric applies to
    hf, wf = p["heating_fuel"], p["hot_water_fuel"]
    p["fuel_scope"] = np.select(
        [hf.eq("heat_network") | wf.eq("heat_network"),
         hf.isin(["oil", "lpg", "solid"]) | wf.isin(["oil", "lpg", "solid"]),
         hf.eq("unknown")],
        ["heat_network", "other_fuel", "no_heating"], "gas_elec")

    # Data-quality flags (natural, not injected)
    p["flag_no_uprn"] = h["uprn"].isna().values
    p["flag_tiny_floor_area"] = p["floor_area"] < 20
    p["flag_rooms_implausible"] = (p["habitable_rooms"] > 15) | (p["floor_area"] / p["habitable_rooms"].clip(lower=1) < 6)
    p["flag_missing_tenure"] = p["tenure"].eq("unknown")
    p["flag_missing_photo_supply"] = h["photo_supply"].isna().values

    crosswalk = pd.DataFrame({"property_id": p["property_id"], "uprn": h["uprn"], "certificate_number": h["certificate_number"],
                              "address1": h["address1"], "address2": h["address2"], "address3": h["address3"],
                              "postcode": p["postcode"]})
    lookup = pd.DataFrame([{"field": f, "raw_value": k, **v} for f, k, v in lookups])
    return p, crosswalk, lookup


def add_geo(p, seed):
    pc = pd.read_csv(RAW / "postcodes/postcodes.csv")
    pc["postcode"] = pc["postcode"].str.upper().str.strip()
    g = p[["postcode"]].merge(pc[["postcode", "lat", "lon", "lsoa", "msoa", "admin_ward", "geo_source"]], on="postcode", how="left")
    rng = np.random.default_rng(seed + 1)
    # ~±40 m jitter so homes in one postcode don't stack on the map [design; display only]
    p["lat"] = (g["lat"] + rng.normal(0, 0.00035, len(g))).round(6).values
    p["lon"] = (g["lon"] + rng.normal(0, 0.00055, len(g))).round(6).values
    for c in ["lsoa", "msoa", "admin_ward", "geo_source"]:
        p[c] = g[c].values
    return p


def build_retrofit_history(allc, homes, pids):
    """Real dated upgrades: fabric/heating improvements between successive certificates of one UPRN."""
    ex = allc[(allc["report_type"] == "2") & allc["uprn"].notna()].sort_values(["uprn", "lodgement_datetime"])
    multi = ex[ex.duplicated("uprn", keep=False)]
    rows = []
    for uprn, g in multi.groupby("uprn"):
        recs = g.to_dict("records")
        for a, b in zip(recs, recs[1:]):
            ra, rb = P.parse_roof(a["roof_description"]), P.parse_roof(b["roof_description"])
            wa, wb = P.parse_wall(a["walls_description"]), P.parse_wall(b["walls_description"])
            ga, gb = P.parse_windows(a["windows_description"]), P.parse_windows(b["windows_description"])
            ha = P.parse_heating(a["mainheat_description"], a["main_fuel"], a["mainheat_energy_eff"])
            hb = P.parse_heating(b["mainheat_description"], b["main_fuel"], b["mainheat_energy_eff"])
            ca, cb = P.parse_controls(a["mainheatcont_description"]), P.parse_controls(b["mainheatcont_description"])
            date = b["lodgement_date"].date().isoformat()
            ev = []
            if pd.notna(ra["loft_mm"]) and pd.notna(rb["loft_mm"]) and rb["loft_mm"] >= ra["loft_mm"] + 50:
                ev.append("loft_insulation")
            if P.WALL_INS_LEVEL.get(wb["wall_insulation"], 0) > P.WALL_INS_LEVEL.get(wa["wall_insulation"], 0) and wa["wall_insulation"] != "unknown":
                ev.append("cavity_wall_insulation" if wa["wall_type"] == "cavity" else "solid_wall_insulation")
            if pd.notna(ga["glazing_level"]) and pd.notna(gb["glazing_level"]) and gb["glazing_level"] > ga["glazing_level"]:
                ev.append("double_glazing")
            if hb["heating"] == "heat_pump" and ha["heating"] != "heat_pump":
                ev.append("heat_pump")
            if ha["heating_detail"] == "gas_boiler" and hb["heating_detail"] == "gas_boiler" and ha["boiler_condensing"] is False and hb["boiler_condensing"] is True:
                ev.append("condensing_boiler")
            if pd.notna(ca["controls_level"]) and pd.notna(cb["controls_level"]) and cb["controls_level"] > ca["controls_level"]:
                ev.append("smart_controls")
            pa, pb = a["photo_supply"], b["photo_supply"]
            if pd.notna(pb) and pb > 0 and (pd.isna(pa) or pa == 0):
                ev.append("solar_pv")
            for e in ev:
                rows.append({"uprn": uprn, "retrofit": e, "completion_date": date,
                             "evidence": "difference between EPC certificates lodged "
                                         f"{a['lodgement_date'].date()} and {date}"})
    rh = pd.DataFrame(rows, columns=["uprn", "retrofit", "completion_date", "evidence"])
    key = homes[["uprn"]].assign(property_id=pids.values).dropna()
    rh = rh.merge(key, on="uprn", how="inner")
    rh["completion_date_note"] = "upper bound: date of the later certificate"
    return rh[["property_id", "retrofit", "completion_date", "completion_date_note", "evidence"]]


def split_assign(p, seed):
    """70/15/15 grouped by postcode; Liverpool fully held out as geo_test."""
    h = p["postcode"].fillna(p["property_id"]).map(lambda s: int(hashlib.md5(f"{seed}-{s}".encode()).hexdigest(), 16) % 100)
    s = np.select([h < 70, h < 85], ["train", "val"], "test")
    s = np.where(p["local_authority"].eq(GEO_TEST_LA), "geo_test", s)
    return pd.DataFrame({"property_id": p["property_id"], "postcode_group": p["postcode"], "split": s})

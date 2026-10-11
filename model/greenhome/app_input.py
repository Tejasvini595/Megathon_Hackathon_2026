"""Homes entered in the web app.

`property_from_record` turns the app's record (web/src/lib/extract/fields.ts) into an engine property record. Every Green Home Score
input is a required question in the app, so nothing the score needs is "unknown" here; the only gap allowed is the EPC rating, which the
SAP estimator (sap.py) fills when the user does not know it.

`app_view` turns dataset homes into exactly what the app would collect (the app's answer categories, a raw 12-month bill or the last
12 monthly readings, no EPC-modelled figures). The SAP estimator and the app relevance model are trained on it, and the customer-path
evaluation (app_eval.py) scores the engine on it, so reported numbers describe what an app user actually gets."""
import numpy as np
import pandas as pd
from . import config as C
from .custom import _per_m2
from .features import annualise, twin_features, TWIN_COLS, TWIN_MIN_MONTHS

NAN = float("nan")
AGE_BAND = {"pre1900": "pre-1900", "1900_1929": "1900-1929", "1930_1949": "1930-1949", "1950_1966": "1950-1966", "1967_1975": "1967-1975",
            "1976_1982": "1976-1982", "1983_1990": "1983-1990", "1991_1995": "1991-1995", "1996_2002": "1996-2002", "2003_2006": "2003-2006",
            "2007_2011": "2007-2011", "2012_2021": "2012-2021", "2022_plus": "2022+"}
AGE_YEAR = {"pre-1900": 1880, "1900-1929": 1915, "1930-1949": 1940, "1950-1966": 1958, "1967-1975": 1971, "1976-1982": 1979, "1983-1990": 1987,
            "1991-1995": 1993, "1996-2002": 1999, "2003-2006": 2005, "2007-2011": 2009, "2012-2021": 2017, "2022+": 2023}
PROPERTY_TYPE = {"house": "House", "bungalow": "Bungalow", "flat": "Flat", "maisonette": "Maisonette"}
BUILT_FORM = {"detached": "Detached", "semi": "Semi-Detached", "end_terrace": "End-Terrace", "mid_terrace": "Mid-Terrace", "flat": "unknown"}
WALL_TYPE = {"cavity": "cavity", "solid_brick": "solid_brick", "stone": "stone", "timber": "timber_frame", "system": "system_built"}
WALL_INS = {"none": (0, "none"), "partial": (1, "partial"), "full": (2, "filled_cavity")}
LOFT_MM = {"none": 0.0, "thin": 50.0, "some": 150.0, "thick": 270.0}           # picture categories -> a depth inside each catalogue step
PART_INS = {"none": "none", "partial": "limited", "full": "insulated"}
GLAZING = {"single": 0, "partial_double": 1, "mostly_double": 2, "double": 3, "high_performance": 4, "triple": 5}
HEATING = {"gas_boiler": "gas_boiler", "gas_warm_air": "gas_warm_air", "gas_room_heaters": "gas_room_heaters", "oil_boiler": "oil_boiler",
           "electric_storage": "electric_storage", "electric_room": "electric_direct", "heat_pump_air": "heat_pump_air",
           "heat_pump_ground": "heat_pump_ground", "heat_network": "community", "solid_fuel": "solid_fuel"}
CONTROLS = {"none": (0, "none"), "programmer": (1, "basic"), "thermostat_trvs": (2, "standard"), "smart": (3, "advanced")}
GAS_HEAT = {"gas_boiler", "gas_warm_air", "gas_room_heaters"}
OIL_KWH_PER_LITRE = 10.35        # heating oil (kerosene), gross calorific value, approximately; DESNZ fuel conversion factors
# ONS region / country codes (ONSPD) and names -> the engine's five climate regions. Wales is split north/south by latitude.
CLIMATE = {"E12000001": "England_E_and_NE", "E12000002": "England_NW_and_N_Wales", "E12000003": "England_E_and_NE", "E12000004": "Midlands",
           "E12000005": "Midlands", "E12000006": "England_E_and_NE", "E12000007": "England_SE_and_Central_S", "E12000008": "England_SE_and_Central_S",
           "E12000009": "England_SW_and_S_Wales", "North East": "England_E_and_NE", "North West": "England_NW_and_N_Wales",
           "Yorkshire and The Humber": "England_E_and_NE", "East Midlands": "Midlands", "West Midlands": "Midlands", "East of England": "England_E_and_NE",
           "London": "England_SE_and_Central_S", "South East": "England_SE_and_Central_S", "South West": "England_SW_and_S_Wales"}
WALES, SCOTLAND, NI = ("W92000004", "W99999999", "Wales"), ("S92000003", "S99999999", "Scotland"), ("N92000002", "N99999999", "Northern Ireland")


def climate_of(place: dict):
    """-> (climate region, out-of-area note or None)."""
    if place.get("climate_region"):
        return place["climate_region"], None
    reg, ctry, lat = place.get("region"), place.get("country"), place.get("lat")
    if reg in CLIMATE:
        return CLIMATE[reg], None
    if reg in WALES or ctry in WALES:
        return ("England_NW_and_N_Wales" if (lat or 0) >= 52.4 else "England_SW_and_S_Wales"), None
    if reg in SCOTLAND + NI or ctry in SCOTLAND + NI:
        return "England_NW_and_N_Wales", ("Our data covers England and Wales only, so estimates for this home are less certain "
                                          "(the nearest climate region, North West England and North Wales, is used).")
    return "England_SE_and_Central_S", "The home's region could not be read from the postcode, so a default climate region is used."


def _usage(rec: dict, p: dict, hdd) -> dict:
    """Metered usage the same way the dataset is annualised: monthly readings (degree-day weighted, NaN-aware) or a yearly total."""
    u = rec.get("usage") or {}
    gas_heated = p["heating_detail"] in GAS_HEAT
    extra_hn = float(u.get("heatNetworkKwh") or 0.0)
    extra_other = float(u.get("oilLitres") or 0.0) * OIL_KWH_PER_LITRE + float(u.get("otherFuelKwh") or 0.0)
    out = dict(elec_annual=NAN, gas_annual=NAN, elec_months=NAN, gas_months=NAN, heat_network_annual=extra_hn, other_fuel_annual=extra_other,
               usage_status="unavailable", intensity=NAN, monthly=[], **{c: NAN for c in TWIN_COLS})
    months = [m for m in (u.get("months") or []) if m.get("month")]
    if months:
        rows = pd.DataFrame({"property_id": "_x", "month": [m["month"] for m in months],
                             "electricity_kwh": [m.get("elecKwh") for m in months],
                             "gas_kwh": [m.get("gasKwh") if m.get("gasKwh") is not None or gas_heated else 0.0 for m in months],
                             "heat_network_kwh": NAN, "other_fuel_kwh": NAN}).astype({"electricity_kwh": float, "gas_kwh": float})
        props = pd.DataFrame([{k: p[k] for k in ("property_id", "climate_region", "heating_fuel", "floor_area", "epc_heating_cost_current")}]).assign(property_id="_x")
        a = annualise(rows, props, hdd)
        if len(a):
            r = a.iloc[0]
            out.update(elec_annual=r.elec_annual, gas_annual=r.gas_annual, elec_months=r.elec_months, gas_months=r.gas_months)
        if len(rows) >= TWIN_MIN_MONTHS:
            t = twin_features(rows, props, hdd).iloc[0]
            out.update({c: float(t[c]) for c in TWIN_COLS})
        out["monthly"] = months
    elif u.get("annual"):
        out.update(elec_annual=float(u["annual"]["elecKwh"]), gas_annual=float(u["annual"].get("gasKwh") or 0.0), elec_months=12, gas_months=12)
    if not (np.isnan(out["elec_annual"]) or np.isnan(out["gas_annual"])):
        out["usage_status"] = "metered"
        if C.FAULT_FLOOR_AREA[0] <= p["floor_area"] <= C.FAULT_FLOOR_AREA[1]:
            out["intensity"] = (out["elec_annual"] + out["gas_annual"] + extra_hn + extra_other) / p["floor_area"]
    return out


def property_from_record(rec: dict, place: dict, ref: dict, hdd=None) -> tuple[dict, list]:
    """App record + where it is -> (engine property record, notes). SAP is filled separately (see sap.apply_rating)."""
    notes = []
    climate, note = climate_of(place)
    if note: notes.append({"code": "outside_training_area" if "England and Wales" in note else "region_unknown", "message": note})
    flat_like = rec["propertyType"] in ("flat", "maisonette")
    own_roof = not flat_like or rec.get("flatLevel") == "top"
    on_ground = not flat_like or rec.get("flatLevel") == "ground"
    hd = HEATING[rec["heating"]]
    fuel_scope = "heat_network" if hd == "community" else "other_fuel" if hd in ("oil_boiler", "solid_fuel") else "gas_elec"
    gas_heat = hd in GAS_HEAT
    area = float(rec["floorAreaM2"])
    block = int(rec.get("blockStoreys") or 1)
    floor_level = (0 if rec.get("flatLevel") == "ground" else block - 1 if rec.get("flatLevel") == "top" else block // 2) if flat_like else NAN
    storeys = 1 if rec["propertyType"] in ("bungalow", "flat") else int(rec.get("storeys") or (2 if rec["propertyType"] == "maisonette" else 2))
    if own_roof and rec.get("roofType") == "flat":
        roof_type, loft, roof_ins = "flat", NAN, PART_INS[rec.get("flatRoofInsulation") or "none"]
    elif own_roof:
        loft = LOFT_MM[rec["loftInsulation"]]
        roof_type, roof_ins = "pitched", "none" if loft <= 0 else "insulated"
    else:
        roof_type, loft, roof_ins = "dwelling_above", NAN, "not_applicable"
    floor_type, floor_ins = (rec["floorType"], PART_INS[rec["floorInsulation"]]) if on_ground else ("other_dwelling_below", "not_applicable")
    wl, wlab = WALL_INS[rec["wallInsulation"]]
    cl, clab = CONTROLS[rec["controls"]]
    gl = GLAZING[rec["glazing"]]
    solar = rec.get("solarPv") == "yes"
    kwp = float(rec.get("solarKw") or 0.0) if solar else 0.0
    age = AGE_BAND[rec["ageBand"]]
    value = rec.get("currentValueGbp")
    p = dict(property_id="YOUR-HOME", customer_id="you", postcode=place.get("postcode") or "(your home)", local_authority=place.get("district") or "(your home)",
             property_type=PROPERTY_TYPE[rec["propertyType"]], built_form=BUILT_FORM[rec["builtForm"]], age_band=age, age_year_est=AGE_YEAR[age],
             floor_area=area, habitable_rooms=float(rec["rooms"]), floor_level=float(floor_level), storeys_est=float(storeys),
             sap_score=NAN, energy_rating=None, potential_sap=NAN, potential_rating=None, epc_primary_kwh_m2=NAN, epc_co2_t=NAN,
             heating=hd, heating_detail=hd, heating_fuel="gas" if gas_heat else ("elec" if hd.startswith(("electric", "heat_pump")) else "other"),
             boiler_condensing=(rec.get("boilerAge") == "from_2005") if hd == "gas_boiler" else None,
             hot_water_fuel="gas" if gas_heat else "elec", mains_gas_flag=gas_heat, hot_water_offpeak=False,
             wall_type=WALL_TYPE[rec["wallType"]], wall_insulation=wlab, wall_insulation_level=float(wl),
             roof_type=roof_type, roof_insulation=roof_ins, loft_mm=loft, floor_type=floor_type, floor_insulation=floor_ins,
             glazing={0: "single", 1: "partial_double", 2: "mostly_double", 3: "double", 4: "high_performance", 5: "triple"}[gl], glazing_level=float(gl),
             controls_level=float(cl), controls_label=clab, smart_controls=cl == 3, has_solar_pv=solar, solar_kwp_est=kwp,
             photo_supply_pct=NAN, low_energy_lighting_pct=NAN, lat=float(place.get("lat") or NAN), lon=float(place.get("lon") or NAN),
             climate_region=climate, fuel_scope=fuel_scope, tenure="unknown",
             current_value_estimate=float(value) if value else NAN, value_source="user-provided",
             flag_tiny_floor_area=area < C.FAULT_FLOOR_AREA[0], flag_rooms_implausible=False, flag_missing_photo_supply=False,
             wall_assumed=False, roof_assumed=False, glazing_assumed=False, outcode="", lsoa="", epc_walls_description="", epc_roof_description="",
             setpoint_reported_c=float(rec["thermostatC"]) if rec.get("thermostatC") else NAN)
    for c in ("epc_heating_cost_current", "epc_hot_water_cost_current", "epc_lighting_cost_current"):
        p[c] = _per_m2(ref, hd, fuel_scope, c) * area          # EPC-modelled costs a customer can't know: median per m2 of similar homes
    p.update(_usage(rec, p, hdd))
    if p["mains_gas_flag"] is False and (p.get("gas_annual") or 0) > 0:
        p["mains_gas_flag"] = True                              # gas on the bill (cooking) means a gas supply
    return p, notes


# ---------------------------------------------------------------- dataset homes as the app would see them (training + evaluation)

def homeowner_noise(a: pd.DataFrame, seed: int = 0) -> pd.DataFrame:
    """Documented model of a homeowner's own answers, used only for evaluation and for the estimator's range calibration:
    floor area within +-15%, rooms off by one 40% of the time, 10% pick the neighbouring glazing / wall-insulation answer."""
    rng = np.random.default_rng(seed); a = a.copy(); n = len(a)
    a["floor_area"] = a.floor_area * rng.uniform(0.85, 1.15, n)
    a["habitable_rooms"] = (a.habitable_rooms + rng.choice([-1, 0, 0, 0, 1], n)).clip(lower=1)
    for c, hi in (("glazing_level", 5), ("wall_insulation_level", 2)):
        flip = rng.random(n) < 0.10
        a.loc[flip, c] = (a[c][flip] + rng.choice([-1, 1], flip.sum())).clip(0, hi)
    return a


def _last12(usage: pd.DataFrame) -> pd.DataFrame:
    last = usage.groupby("property_id").month.transform("max")
    y, m = last.str[:4].astype(int), last.str[5:7].astype(int)
    first = (y - 1).astype(str) + "-" + (m % 12 + 1).astype(str).str.zfill(2)
    first = first.where(m != 12, y.astype(str) + "-01")
    return usage[usage.month >= first]


def app_view(df: pd.DataFrame, usage: pd.DataFrame, ref, hdd=None, monthly: bool = True) -> pd.DataFrame:
    """Dataset homes reduced to the app's questions. monthly=True: the last 12 monthly readings (annualised the app's way, with
    monthly-shape features); False: a raw 12-month bill total, no monthly shape. EPC-modelled fields are replaced the way the app
    fills them; SAP is left as recorded (callers swap in the estimator)."""
    a = df.copy()
    a["age_year_est"] = a.age_band.astype(str).map(AGE_YEAR).astype(float)
    a["wall_insulation_level"] = a.wall_insulation_level.clip(upper=2)
    pitched = a.roof_type.astype(str).isin(["pitched", "roof_room", "thatched"])
    a["loft_mm"] = pd.cut(a.loft_mm, [-1, 0, 99, 199, 1e9], labels=[0.0, 50.0, 150.0, 270.0]).astype(float).where(pitched)
    # a home with a pitched roof must answer the loft question; dataset homes without a depth answer from their insulation category
    cat = a.roof_insulation.astype(str).map({"none": 0.0, "limited": 50.0, "insulated": 270.0})
    a["loft_mm"] = a.loft_mm.fillna(cat.where(pitched))
    a["solar_kwp_est"] = a.solar_kwp_est.fillna(0).round(1)
    a["has_solar_pv"] = a.solar_kwp_est > 0
    a["boiler_condensing"] = a.boiler_condensing.where(a.heating_detail.astype(str) != "gas_boiler", a.boiler_condensing.fillna(True))
    a["glazing_level"] = a.glazing_level.fillna(3)
    for c in ("epc_primary_kwh_m2", "epc_co2_t", "photo_supply_pct", "low_energy_lighting_pct"):
        a[c] = np.nan
    for c in ("epc_heating_cost_current", "epc_hot_water_cost_current", "epc_lighting_cost_current"):
        key = a.heating_detail.astype(str) + "|" + a.fuel_scope.astype(str)
        a[c] = key.map(lambda k: ref["by_heating"].get(k, {}).get(c, np.nan)).astype(float) * a.floor_area
    if "setpoint_reported_c" in a:
        a["setpoint_reported_c"] = np.nan
    u = _last12(usage[usage.property_id.isin(a.property_id)])
    props = a[["property_id", "climate_region", "heating_fuel", "floor_area", "epc_heating_cost_current"]]
    if monthly:
        ann = annualise(u, props, hdd)
        tw = twin_features(u, props, hdd)
    else:
        s = u.groupby("property_id")[["electricity_kwh", "gas_kwh", "heat_network_kwh", "other_fuel_kwh"]].sum(min_count=1)
        n = u.groupby("property_id").electricity_kwh.count()
        ann = pd.DataFrame({"elec_annual": s.electricity_kwh.where(n >= 12), "gas_annual": s.gas_kwh.fillna(0).where(n >= 12),
                            "heat_network_annual": s.heat_network_kwh, "other_fuel_annual": s.other_fuel_kwh, "elec_months": n, "gas_months": n})
        ann["usage_status"] = np.where(ann.elec_annual.notna(), "metered", "unavailable")
        tw = pd.DataFrame(np.nan, index=a.property_id, columns=TWIN_COLS)
    a = a.drop(columns=[c for c in list(ann.columns) + TWIN_COLS if c in a]).merge(ann, left_on="property_id", right_index=True, how="left") \
         .merge(tw, left_on="property_id", right_index=True, how="left")
    a["usage_status"] = a.usage_status.fillna("unavailable")
    d = a[["elec_annual", "gas_annual", "heat_network_annual", "other_fuel_annual"]].fillna(0)
    ok = (a.usage_status == "metered") & a.floor_area.between(*C.FAULT_FLOOR_AREA)
    a["intensity"] = np.where(ok, d.sum(axis=1) / a.floor_area, np.nan)
    return a

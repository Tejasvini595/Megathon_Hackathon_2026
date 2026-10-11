"""Build a full property record from what a customer can realistically type in. Anything unknown stays NaN/None (never zero);
EPC-modelled fields a customer cannot know (primary energy, EPC costs) are filled with dataset medians for similar homes and flagged."""
import json
import numpy as np
import pandas as pd
from . import config as C

CLIMATE = {"South East / London / central south": "England_SE_and_Central_S", "South West / South Wales": "England_SW_and_S_Wales",
           "Midlands": "Midlands", "North West / North Wales": "England_NW_and_N_Wales", "East / North East": "England_E_and_NE"}
AGE_BANDS = {"pre-1900": 1880, "1900-1929": 1915, "1930-1949": 1940, "1950-1966": 1958, "1967-1975": 1971, "1976-1982": 1979,
             "1983-1990": 1987, "1991-1995": 1993, "1996-2002": 1999, "2003-2006": 2005, "2007-2011": 2009, "2012-2021": 2017}
HEATING = {"Gas boiler (condensing / modern)": ("gas_boiler", True), "Gas boiler (older, non-condensing)": ("gas_boiler", False),
           "Gas boiler (not sure which)": ("gas_boiler", None), "Electric heaters / direct": ("electric_direct", None),
           "Electric storage heaters": ("electric_storage", None), "Heat pump": ("heat_pump_air", None),
           "Gas warm air": ("gas_warm_air", None), "Gas room heaters": ("gas_room_heaters", None),
           "Community / district heating": ("community", None), "Oil boiler": ("oil_boiler", None)}
GLAZING = {"Single glazing": (0, "single"), "Partial double glazing": (1, "partial_double"), "Mostly double glazing": (2, "mostly_double"),
           "Fully double glazing": (3, "double"), "Triple glazing": (5, "triple")}
WALL_TYPE = {"Cavity": "cavity", "Solid brick": "solid_brick", "Stone": "stone", "System built": "system_built", "Timber frame": "timber_frame"}
WALL_INS = {"No insulation": (0, "none"), "Partial insulation": (1, "partial"), "Fully insulated (filled cavity / internal / external)": (2, "filled_cavity")}
CONTROLS = {"No controls / basic": (1, "basic"), "Programmer + room thermostat / TRVs": (2, "standard"), "Zoned or smart controls": (3, "zoned")}
PROPERTY_TYPES = ["House", "Flat", "Maisonette", "Bungalow"]
BUILT_FORMS = ["Detached", "Semi-Detached", "Mid-Terrace", "End-Terrace", "unknown"]


COST_COLS = ["epc_heating_cost_current", "epc_hot_water_cost_current", "epc_lighting_cost_current"]
REFERENCE_FILE = C.MODELS / "customer_reference.json"


def _per_m2(ref, hd: str, fuel_scope: str, col: str) -> float:
    """Median EPC cost per m2 of similar dataset homes (same heating and fuel scope; all homes if the heating type never occurs).
    `ref` is the dataset (DataFrame) or the same medians precomputed by `cost_reference`."""
    if isinstance(ref, dict):
        return ref["by_heating"].get(f"{hd}|{fuel_scope}", {}).get(col, np.nan) if hd in ref["heating_types"] else ref["all"][col]
    sim = ref[(ref.heating_detail == hd) & (ref.fuel_scope == fuel_scope)] if (ref.heating_detail == hd).any() else ref
    return float((sim[col] / sim.floor_area).median())


def cost_reference(df: pd.DataFrame) -> dict:
    """Everything `build_property` reads from the dataset, precomputed once (a few hundred bytes), so a customer home can be built
    without loading the 129k-home table."""
    hds = sorted({str(h) for h in df.heating_detail.dropna().unique()})
    by = {}
    for hd in hds:
        for fs in sorted({str(f) for f in df.fuel_scope.dropna().unique()}):
            sim = df[(df.heating_detail == hd) & (df.fuel_scope == fs)]
            if len(sim):
                by[f"{hd}|{fs}"] = {c: float((sim[c] / sim.floor_area).median()) for c in COST_COLS}
    return {"heating_types": hds, "by_heating": by, "all": {c: float((df[c] / df.floor_area).median()) for c in COST_COLS}}


def save_reference(df: pd.DataFrame):
    REFERENCE_FILE.write_text(json.dumps(cost_reference(df), indent=1))


def load_reference() -> dict:
    r = json.loads(REFERENCE_FILE.read_text()); r["heating_types"] = set(r["heating_types"]); return r


def build_property(x: dict, ref) -> dict:
    """ref: the dataset or `load_reference()`. x keys: property_type, built_form, floor_area, age_band, habitable_rooms, energy_rating, heating (HEATING key), wall_type, wall_ins,
    loft ('unknown' or mm), glazing, controls, solar_kwp (None=unknown, 0=none), climate, elec_kwh/gas_kwh (optional annual), current_value (optional)."""
    hd, cond = HEATING[x["heating"]]
    gl_level, gl_label = GLAZING[x["glazing"]]; w_level, w_label = WALL_INS[x["wall_ins"]]; c_level, c_label = CONTROLS[x["controls"]]
    gas_heat = hd in ("gas_boiler", "gas_warm_air", "gas_room_heaters")
    fuel_scope = "gas_elec" if hd not in ("community", "oil_boiler") else ("heat_network" if hd == "community" else "other_fuel")
    pitched = x["property_type"] in ("House", "Bungalow")
    per_m2 = lambda col: _per_m2(ref, hd, fuel_scope, col)
    area = float(x["floor_area"]); sap = float(C.SAP_MID[x["energy_rating"]])
    loft = None if x["loft"] in (None, "unknown") else float(x["loft"])
    kwp = x.get("solar_kwp")
    p = dict(property_id="YOUR-HOME", customer_id="you", postcode="(your home)", local_authority="(your home)", property_type=x["property_type"],
             built_form=x["built_form"], age_band=x["age_band"], age_year_est=AGE_BANDS[x["age_band"]], floor_area=area,
             habitable_rooms=float(x["habitable_rooms"]), floor_level=np.nan, storeys_est=1 if x["property_type"] in ("Flat", "Maisonette", "Bungalow") else 2,
             sap_score=sap, energy_rating=x["energy_rating"], potential_sap=np.nan, potential_rating=None,
             epc_primary_kwh_m2=np.nan, epc_co2_t=np.nan,
             epc_heating_cost_current=per_m2("epc_heating_cost_current") * area, epc_hot_water_cost_current=per_m2("epc_hot_water_cost_current") * area,
             epc_lighting_cost_current=per_m2("epc_lighting_cost_current") * area,
             heating=hd, heating_detail=hd, heating_fuel="gas" if gas_heat else ("elec" if hd.startswith(("electric", "heat_pump")) else "other"),
             boiler_condensing=cond, hot_water_fuel="gas" if gas_heat else "elec", mains_gas_flag=gas_heat, hot_water_offpeak=False,
             wall_type=WALL_TYPE[x["wall_type"]], wall_insulation=w_label, wall_insulation_level=float(w_level),
             roof_type="pitched" if pitched else "dwelling_above", roof_insulation="unknown" if loft is None else ("none" if loft <= 0 else "insulated"),
             loft_mm=np.nan if loft is None else loft,
             floor_type="solid" if pitched else "other_dwelling_below", floor_insulation="unknown" if pitched else "not_applicable",
             glazing=gl_label, glazing_level=float(gl_level), controls_level=float(c_level), controls_label=c_label,
             smart_controls=c_level == 3, has_solar_pv=None if kwp is None else bool(kwp > 0), solar_kwp_est=np.nan if kwp is None else float(kwp),
             photo_supply_pct=np.nan, low_energy_lighting_pct=np.nan, lat=np.nan, lon=np.nan,
             climate_region=CLIMATE[x["climate"]], fuel_scope=fuel_scope, tenure="unknown",
             current_value_estimate=float(x["current_value"]) if x.get("current_value") else np.nan, value_source="user-provided",
             flag_tiny_floor_area=False, flag_rooms_implausible=False, flag_missing_photo_supply=kwp is None, wall_assumed=False, roof_assumed=loft is None,
             glazing_assumed=False, outcode="", lsoa="", epc_walls_description="", epc_roof_description="")
    p["setpoint_reported_c"] = float(x["setpoint_c"]) if x.get("setpoint_c") else float("nan")      # optional: usual heating temperature, 0 / blank = not given
    e, g = x.get("elec_kwh"), x.get("gas_kwh")
    if e and g is not None and e > 0:
        p.update(elec_annual=float(e), gas_annual=float(g), elec_months=12, gas_months=12, usage_status="metered",
                 intensity=(float(e) + float(g)) / area, heat_network_annual=0.0, other_fuel_annual=0.0)
    else:
        p.update(elec_annual=np.nan, gas_annual=np.nan, elec_months=np.nan, gas_months=np.nan, usage_status="unavailable", intensity=np.nan)
    return p


if __name__ == "__main__":      # python -m greenhome.custom  -> rewrite models/customer_reference.json from the dataset
    from .features import build_master
    save_reference(build_master()); print("wrote", REFERENCE_FILE)

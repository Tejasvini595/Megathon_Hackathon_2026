"""Rule-based parsing of EPC free-text descriptions into typed columns.

Each parser is applied to the *distinct* strings of a field (21-107 per field), and the
resulting string -> typed mapping is written to out/description_lookup.csv so every
mapping can be reviewed by hand. Unmatched strings map to "unknown", never a guess.
Welsh-language variants found in the Cardiff data are handled explicitly.
"""
import re

import numpy as np


def _l(s):
    return s.strip().lower() if isinstance(s, str) else ""


# ---------------------------------------------------------------- walls
def parse_wall(s):
    t = _l(s)
    out = {"wall_type": "unknown", "wall_insulation": "unknown", "wall_assumed": "(assumed)" in t or "rhagdybiaeth" in t}
    if not t:
        return out
    if t.startswith("average thermal transmittance"):
        u = float(re.findall(r"[\d.]+", t)[0])
        out.update(wall_type="unknown", wall_insulation="insulated" if u <= 0.6 else "none", wall_u_value=u)
        return out
    if "cavity" in t or "ceudod" in t:
        wt = "cavity"
    elif "solid brick" in t or "briciau solet" in t:
        wt = "solid_brick"
    elif "sandstone" in t or "tywodfaen" in t or "granite" in t or "cob" in t:
        wt = "stone"
    elif "system built" in t or "yn ôl system" in t:
        wt = "system_built"
    elif "timber frame" in t:
        wt = "timber_frame"
    elif "basement" in t or "curtain" in t or "park home" in t:
        wt = "other"
    else:
        wt = "unknown"
    if "filled cavity and" in t:
        ins = "filled_plus"
    elif "filled cavity" in t or "wedi’i lenwi" in t:
        ins = "filled_cavity"
    elif "external insulation" in t or "allanol" in t:
        ins = "external"
    elif "internal insulation" in t:
        ins = "internal"
    elif "additional insulation" in t:
        ins = "insulated"
    elif "partial insulation" in t or "rhannol" in t:
        ins = "partial"
    elif "no insulation" in t or "dim inswleiddio" in t:
        ins = "none"
    elif "insulated" in t or "hinswleiddio" in t:
        ins = "as_built_insulated"
    elif t in ("cob, as built", "park home wall, as built", "basement wall", "basement wall, as built"):
        ins = "none"
    else:
        ins = "unknown"
    out.update(wall_type=wt, wall_insulation=ins)
    return out


# Ordinal used by the score and simulator: higher = better insulated
WALL_INS_LEVEL = {"none": 0, "partial": 1, "as_built_insulated": 2, "filled_cavity": 2, "internal": 2,
                  "external": 2, "insulated": 2, "filled_plus": 3, "unknown": np.nan}


# ---------------------------------------------------------------- roof
def parse_roof(s):
    t = _l(s)
    out = {"roof_type": "unknown", "roof_insulation": "unknown", "loft_mm": np.nan,
           "roof_assumed": "(assumed)" in t or "rhagdybiaeth" in t}
    if not t or "(error)" in t:
        return out
    if "another dwelling above" in t or "annedd arall uwchben" in t:
        out.update(roof_type="dwelling_above", roof_insulation="not_applicable")
        return out
    if "premises above" in t:
        out.update(roof_type="premises_above", roof_insulation="not_applicable")
        return out
    if "same dwelling above" in t:
        out.update(roof_type="same_dwelling_above", roof_insulation="not_applicable")
        return out
    if t.startswith("average thermal transmittance"):
        u = float(re.findall(r"[\d.]+", t)[0])
        out.update(roof_type="unknown", roof_insulation="insulated" if u <= 0.35 else "limited", roof_u_value=u)
        return out
    if t.startswith("pitched") or t.startswith("ar oleddf"):
        rt = "pitched"
    elif t.startswith("flat"):
        rt = "flat"
    elif t.startswith("roof room"):
        rt = "roof_room"
    elif t.startswith("thatched"):
        rt = "thatched"
    else:
        rt = "unknown"
    m = re.search(r"(\d+)\+?\s*mm", t)
    if m:
        mm = float(m.group(1))
        out["loft_mm"] = mm
        ins = "none" if mm == 0 else "limited" if mm < 100 else "insulated"
    elif "no insulation" in t:
        out["loft_mm"] = 0.0 if rt == "pitched" else np.nan
        ins = "none"
    elif "limited insulation" in t:
        ins = "limited"
    elif "unknown loft insulation" in t:
        ins = "unknown"
    elif "insulat" in t or "additional insulation" in t:
        ins = "insulated"
    elif rt == "thatched":
        ins = "limited"  # thatch has inherent but limited insulation [design]
    else:
        ins = "unknown"
    out.update(roof_type=rt, roof_insulation=ins)
    return out


# ---------------------------------------------------------------- windows
_GLAZING = [
    ("fully triple", "triple", 5), ("mostly triple", "mostly_triple", 4), ("partial triple", "partial_triple", 2),
    ("high performance", "high_performance", 4), ("ffenestri perfformiad uchel", "high_performance", 4),
    ("fully double", "double", 3), ("gwydrau dwbl llawn", "double", 3),
    ("multiple glazing throughout", "double", 3), ("gwydrau lluosog ym mhobman", "double", 3),
    ("full secondary", "secondary", 3),
    ("mostly double", "mostly_double", 2), ("gwydrau dwbl gan mwyaf", "mostly_double", 2),
    ("mostly multiple", "mostly_double", 2), ("mostly secondary", "mostly_double", 2),
    ("partial double", "partial_double", 1), ("some double", "partial_double", 1), ("rhai gwydrau dwbl", "partial_double", 1),
    ("partial multiple", "partial_double", 1), ("some multiple", "partial_double", 1),
    ("partial secondary", "partial_double", 1), ("some secondary", "partial_double", 1),
    ("single glazed", "single", 0),
]


def parse_windows(s):
    t = _l(s)
    for key, cat, lvl in _GLAZING:
        if key in t:
            return {"glazing": cat, "glazing_level": lvl}
    return {"glazing": "unknown", "glazing_level": np.nan}


# ---------------------------------------------------------------- floor
def parse_floor(s):
    t = _l(s)
    out = {"floor_type": "unknown", "floor_insulation": "unknown"}
    if not t:
        return out
    if "dwelling below" in t or "premises below" in t or "anheddiad arall islaw" in t:
        return {"floor_type": "other_dwelling_below", "floor_insulation": "not_applicable"}
    ft = ("solid" if t.startswith("solid") or t.startswith("solet") else
          "suspended" if t.startswith("suspended") or t.startswith("crog") else
          "unheated_space" if "unheated" in t else "external_air" if "external air" in t else
          "basement" if "basement" in t else "unknown")
    ins = ("none" if "no insulation" in t or "dim inswleiddio" in t else
           "limited" if "limited" in t or "cyfyngedig" in t else
           "insulated" if "insulated" in t else "unknown")
    return {"floor_type": ft, "floor_insulation": ins}


# ---------------------------------------------------------------- heating
def parse_heating(desc, main_fuel, mainheat_eff):
    """Main heating system from the first component of mainheat_description."""
    t = _l(desc)
    f = _l(main_fuel)
    # Multiple systems are joined with ", <Capitalised system>"; keep the first (main) one
    parts = re.split(r", (?=[A-Z])", desc.strip()) if isinstance(desc, str) else [""]
    first = parts[0]
    if first.lower().startswith("warm air") and len(parts) > 1:
        first += ", " + parts[1]
    first = first.lower()
    if "heat pump" in first:
        sysd = "heat_pump_ground" if ("ground" in first or "water source" in first) else "heat_pump_air"
    elif "community" in first or "(community)" in f:
        sysd = "community"
    elif "storage heater" in first or "electricaire" in first or "stôr wresogyddion" in first:
        sysd = "electric_storage"
    elif ("boiler" in first or "bwyler" in first or "micro-cogeneration" in first) and ("mains gas" in first or "nwy prif" in first):
        sysd = "gas_boiler"
    elif "boiler" in first and "lpg" in first:
        sysd = "lpg_boiler"
    elif "oil" in first:
        sysd = "oil_boiler"
    elif "boiler" in first and "electric" in first:
        sysd = "electric_boiler"
    elif any(k in first for k in ["dual fuel", "coal", "wood", "pellet", "biomass", "anthracite", "smokeless"]):
        sysd = "solid_fuel"
    elif "warm air" in first and "mains gas" in first:
        sysd = "gas_warm_air"
    elif "room heaters" in first and "mains gas" in first:
        sysd = "gas_room_heaters"
    elif any(k in first for k in ["room heaters, electric", "electric underfloor", "electric ceiling", "portable electric",
                                    "no system present"]):
        sysd = "electric_direct"
    elif first.startswith("boiler"):  # fuel missing from description: fall back to main_fuel
        sysd = ("gas_boiler" if "mains gas" in f else "oil_boiler" if "oil" in f else
                "lpg_boiler" if "lpg" in f else "electric_boiler" if "electric" in f else "unknown")
    else:
        sysd = "unknown"
    # Brief-level category
    heating = {"gas_boiler": "gas_boiler", "gas_warm_air": "gas_other", "gas_room_heaters": "gas_other",
               "heat_pump_air": "heat_pump", "heat_pump_ground": "heat_pump", "electric_storage": "electric",
               "electric_direct": "electric", "electric_boiler": "electric", "oil_boiler": "oil",
               "lpg_boiler": "lpg", "solid_fuel": "solid_fuel", "community": "community", "unknown": "unknown"}[sysd]
    # Condensing proxy for gas boilers from EPC's main-heating efficiency rating [design]
    e = _l(mainheat_eff)
    boiler_condensing = (sysd == "gas_boiler" and e in ("good", "very good")) if sysd == "gas_boiler" else np.nan
    return {"heating_detail": sysd, "heating": heating, "boiler_condensing": boiler_condensing,
            "heating_assumed": "assumed" in t}


def heating_fuel(sysd):
    return {"gas_boiler": "gas", "gas_warm_air": "gas", "gas_room_heaters": "gas", "heat_pump_air": "elec",
            "heat_pump_ground": "elec", "electric_storage": "elec", "electric_direct": "elec",
            "electric_boiler": "elec", "oil_boiler": "oil", "lpg_boiler": "lpg", "solid_fuel": "solid",
            "community": "heat_network"}.get(sysd, "unknown")


# ---------------------------------------------------------------- hot water
def parse_hotwater(s, heat_fuel):
    t = _l(s)
    solar = "plus solar" in t
    if t.startswith("from main system") or t.startswith("o’r brif system") or t.startswith("from secondary"):
        src, fuel = "main_system", heat_fuel
    elif "community" in t:
        src, fuel = "community", "heat_network"
    elif "heat pump" in t:
        src, fuel = "heat_pump_water", "elec"
    elif "immersion" in t or "electric instantaneous" in t or "twymwr tanddwr" in t:
        src, fuel = ("electric_instant" if "instantaneous" in t else "electric_immersion"), "elec"
    elif "gas" in t:
        src, fuel = "gas_other", "gas"
    elif "solid fuel" in t:
        src, fuel = "solid_other", "solid"
    else:
        src, fuel = "unknown", heat_fuel
    if fuel == "unknown":
        fuel = "elec"
    return {"hot_water_source": src, "hot_water_fuel": fuel, "solar_thermal_from_text": solar,
            "hot_water_offpeak": "off-peak" in t}


# ---------------------------------------------------------------- controls
def parse_controls(s):
    t = _l(s)
    if not t or "undefined" in t:
        return {"controls_level": np.nan, "controls_label": "unknown"}
    if "zone control" in t or "at least two room thermostats" in t or "boiler energy manager" in t:
        lvl = 3
    elif t == "none" or "no time or thermostatic" in t or "no thermostatic control" in t:
        lvl = 0
    elif t.startswith("2106") or t.startswith("2104"):
        lvl = 2
    elif t.startswith("2401") or "manual charge" in t:
        lvl = 1
    elif ("programmer" in t and ("room thermostat" in t or "trv" in t)) or ("room thermostat" in t and "trv" in t) \
            or "high heat retention" in t or "celect" in t or "automatic charge" in t:
        lvl = 2
    else:
        lvl = 1
    return {"controls_level": lvl, "controls_label": ["none", "basic", "standard", "advanced"][lvl]}


# ---------------------------------------------------------------- misc
AGE_BANDS = {
    "England and Wales: before 1900": ("pre-1900", 1890), "England and Wales: 1900-1929": ("1900-1929", 1915),
    "England and Wales: 1930-1949": ("1930-1949", 1940), "England and Wales: 1950-1966": ("1950-1966", 1958),
    "England and Wales: 1967-1975": ("1967-1975", 1971), "England and Wales: 1976-1982": ("1976-1982", 1979),
    "England and Wales: 1983-1990": ("1983-1990", 1987), "England and Wales: 1991-1995": ("1991-1995", 1993),
    "England and Wales: 1996-2002": ("1996-2002", 1999), "England and Wales: 2003-2006": ("2003-2006", 2005),
    "England and Wales: 2007-2011": ("2007-2011", 2009), "England and Wales: 2012-2021": ("2012-2021", 2017),
    "England and Wales: 2022 onwards": ("2022+", 2023),
}


def parse_floor_level(s):
    t = _l(s)
    if t in ("", "none", "nodata!"):
        return np.nan
    if "basement" in t:
        return -1
    if "ground" in t:
        return 0
    if "21st or above" in t:
        return 21
    m = re.match(r"(\d+)", t)
    return float(m.group(1)) if m else np.nan

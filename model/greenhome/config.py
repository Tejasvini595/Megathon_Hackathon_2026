"""Central, documented constants. Everything the engine assumes lives here.
Data is read from dataset/ (parquet, never modified). Old sample files in data/ are ignored."""
from pathlib import Path
import json
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "dataset"
MODELS = ROOT / "models"
REPORTS = ROOT / "reports"
CACHE = REPORTS / "cache"

# ---------------------------------------------------------------- Green Home Score (fixed by the brief)
WEIGHTS = {"energy_efficiency": 0.25, "energy_intensity": 0.20, "insulation": 0.15, "heating": 0.15,
           "glazing": 0.10, "renewable": 0.10, "smart": 0.05}
assert abs(sum(WEIGHTS.values()) - 1) < 1e-9
CLASSES = [(80, "Highly efficient"), (65, "Good"), (50, "Moderate"), (30, "Poor"), (0, "Very poor")]

# ---- Sub-score maps (all monotone: a better state never scores lower). NaN = unknown -> excluded, weights renormalised
# energy_efficiency: the recorded EPC SAP score (1-100) is itself the rating-based measure (band A-G is derived from it).
# energy_intensity: annualised METERED delivered kWh/m2/yr -> piecewise-linear, decreasing.
INTENSITY_X = [40, 80, 120, 170, 250, 350]
INTENSITY_Y = [100, 88, 70, 50, 25, 0]
# insulation = weighted mean of available parts (walls 50%, roof 35%, floor 15%); N/A parts (e.g. flat with a
# dwelling above) are excluded rather than penalised.
INS_W = {"wall": 0.50, "roof": 0.35, "floor": 0.15}
WALL_LEVEL_SCORE = {0: 10, 1: 45, 2: 90, 3: 100}                     # wall_insulation_level
LOFT_X = [0, 50, 100, 150, 200, 270]; LOFT_Y = [0, 25, 50, 70, 85, 100]   # loft_mm when a depth is stated
ROOF_CAT_SCORE = {"none": 5, "limited": 40, "insulated": 75}          # when depth not stated; 'unknown' -> NaN
FLOOR_SCORE = {"none": 15, "limited": 55, "insulated": 100}           # 'not_applicable'/'unknown' -> excluded
ROOF_NA = {"dwelling_above", "premises_above", "same_dwelling_above"}
# heating: ordered by efficiency / carbon intensity of the system
HEATING_SCORE = {"heat_pump_ground": 100, "heat_pump_air": 100, "community": 75, "gas_boiler_condensing": 70,
                 "gas_boiler_unknown": 55, "gas_boiler_noncondensing": 40, "gas_warm_air": 40, "electric_storage": 45,
                 "electric_direct": 35, "gas_room_heaters": 30, "oil_boiler": 30, "solid_fuel": 10}
GLAZING_LEVEL_SCORE = {0: 5, 1: 35, 2: 55, 3: 75, 4: 92, 5: 100}      # glazing_level 0 single .. 5 triple
SOLAR_X = [0, 1, 2, 3, 4]; SOLAR_Y = [0, 35, 60, 80, 100]             # estimated kWp -> score
CONTROLS_SCORE = {0: 0, 1: 20, 2: 50, 3: 100}                         # controls_level; EPC has no smart-thermostat field

# ---------------------------------------------------------------- Annualisation
MIN_MONTHS = 6                    # fewer observed months -> unavailable
WINTER_MONTHS = {12, 1, 2}        # at least one observed winter month required
HEAT_SHARE = {"gas": 0.75, "heat_network": 0.75, "other": 0.75, "elec_heating": 0.50, "elec_other": 0.05}  # share of annual use following HDD
FAULT_FLOOR_AREA = (20, 500)      # m2; outside -> intensity treated as unavailable (flagged, not dropped)

# ---------------------------------------------------------------- Emissions & tariffs
def _ef():
    """Emission factors come ONLY from dataset/emissions_factors.parquet (DESNZ 2025). No silent fallback: a missing file must stop the run."""
    e = pd.read_parquet(DATA / "emissions_factors.parquet").set_index("fuel")
    return {"elec": float(e.loc["electricity", "kg_co2e_per_kwh"]), "gas": float(e.loc["gas", "kg_co2e_per_kwh"])}, str(e.loc["gas", "source"])
EMISSION_FACTORS, EMISSION_SOURCE = _ef()
# GBP/kWh, INDICATIVE unit rates: order of magnitude of Ofgem's default-tariff price cap (https://www.ofgem.gov.uk/energy-price-cap),
# roughly 25-28 p/kWh electricity and 6-7 p/kWh gas in 2025-26. Not looked up per region or quarter: re-check against the current cap before
# quoting any bill figure. Used ONLY for payback / suitability and the SAP cost proxy, never for energy or carbon.
TARIFF = {"elec": 0.27, "gas": 0.07}
PAYBACK_HIGH, PAYBACK_MED = 10, 20      # years -> suitability High / Medium / Low

# ---------------------------------------------------------------- Retrofit physics (from dataset/retrofit_catalogue)
CATALOGUE = pd.read_parquet(DATA / "retrofit_catalogue.parquet").set_index("retrofit_id")   # no silent fallback: fail loudly if missing
ORDER = ["loft_insulation", "cavity_wall_insulation", "solid_wall_insulation", "floor_insulation", "double_glazing",
         "smart_controls", "heat_pump", "condensing_boiler", "solar_pv"]     # = catalogue fabric_first_order
LABEL = {"loft_insulation": "Loft insulation", "cavity_wall_insulation": "Cavity wall insulation",
         "solid_wall_insulation": "Solid wall insulation", "floor_insulation": "Floor insulation",
         "double_glazing": "Double glazing", "smart_controls": "Smart thermostat / zoned controls",
         "heat_pump": "Heat pump", "condensing_boiler": "Condensing boiler", "solar_pv": "Solar PV (2.5 kWp)"}
PARAMS = {  # impacts transcribed from the catalogue's impact_model column (cut in space-heating demand unless noted)
    "loft_by_depth": {"zero": 0.15, "lt100": 0.08, "lt200": 0.03},   # 0 mm / <100 mm / 100-199 mm ; >=200 mm -> 0
    "loft_by_cat": {"none": 0.15, "limited": 0.08},             # when depth not stated
    "cavity": {0: 0.12, 1: 0.06}, "solid": {0: 0.22, 1: 0.10},  # by wall_insulation_level
    "floor": {"suspended": 0.06, "solid": 0.04},
    "glazing": {0: 0.10, 1: 0.07, 2: 0.04},                     # by glazing_level
    "controls": 0.06,
    "scop": 2.8, "scop_dhw": 2.5,
    "boiler_eff": {True: 0.85, False: 0.72, None: 0.80},       # condensing flag -> seasonal efficiency
    "boiler_new_eff": 0.85,
    "other_gas_eff": 0.72,                                      # warm air / room heaters
    "solar_kwp": 2.5, "self_use": 0.45,
    "solar_yield": {"England_SE_and_Central_S": 960, "England_SW_and_S_Wales": 1000, "Midlands": 900,
                    "England_NW_and_N_Wales": 850, "England_E_and_NE": 880},   # kWh/kWp/yr, PVGIS-style approximations
    "gas_cooking_share": 0.05,      # assumption: share of gas not for heat/hot water
    "elec_heat_share": 0.55,        # electric-heated homes: share of grid import used for heating (assumption)
    "hp_heat_share": 0.45,          # existing heat-pump homes
}
SAP_BANDS = [("A", 92), ("B", 81), ("C", 69), ("D", 55), ("E", 39), ("F", 21), ("G", 1)]
SAP_MID = {"A": 96, "B": 86, "C": 74.5, "D": 61.5, "E": 46.5, "F": 29.5, "G": 10}   # band mid-points, used only when a customer gives a band but not a SAP score

# ---- calibration written by `python -m greenhome.train` (fitted on the TRAIN split only against the real EPC / reference labels)
_CAL = MODELS / "calibration.json"
_cal = json.loads(_CAL.read_text()) if _CAL.exists() else {}
CALIBRATED = bool(_cal)                                   # False -> identity scales (run train.py)
SAP_GAIN_SCALE = _cal.get("sap_gain_scale", 1.0)          # multiplies the engine's SAP gain (fitted so the mean matches the EPC's own potential-SAP gain)
UNCERT_SCALE = _cal.get("uncertainty_scale", {"elec": 1.0, "gas": 1.0, "imp": 1.0, "carbon": 1.0})   # widens Monte Carlo half-widths to ~80% coverage

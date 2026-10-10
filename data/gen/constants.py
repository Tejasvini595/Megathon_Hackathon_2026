"""Every constant used by the dataset build, with its source.

Tags used in the `SOURCE` notes:
  [cited]   value read from the named public source
  [approx]  planning value from the named source family; documented as approximate in DATA.md
  [design]  our own documented modelling choice (not a measured value)
"""

SEED = 42

# Meter period simulated for energy_usage (two full heating seasons)
MONTHS_START = "2024-10"
MONTHS_END = "2026-09"

# Valuation date for current_value_estimate (latest UK HPI month available)
VALUATION_MONTH = "2026-07"

# Councils in the extract; Liverpool is the held-out unseen-city test
GEO_TEST_LA = "Liverpool"

# --- Met Office HadUK-Grid regional series used per council -------------------
# [cited] Met Office HadUK-Grid regional monthly mean temperature (OGL)
LA_CLIMATE_REGION = {
    "Barnet": "England_SE_and_Central_S",
    "Camden": "England_SE_and_Central_S",
    "Croydon": "England_SE_and_Central_S",
    "City of London": "England_SE_and_Central_S",
    "Manchester": "England_NW_and_N_Wales",
    "Liverpool": "England_NW_and_N_Wales",
    "Birmingham": "Midlands",
    "Bristol, City of": "England_SW_and_S_Wales",
    "Cardiff": "England_SW_and_S_Wales",
    "Newcastle upon Tyne": "England_E_and_NE",
}

# Degree-day base temperature and Hitchin (1983) monthly HDD formula constant
# [cited] base 15.5 C as used by DESNZ Energy Trends; [approx] Hitchin k = 0.71 /C
HDD_BASE_C = 15.5
HITCHIN_K = 0.71

# --- SAP 10.2 primary energy factors (kWh primary / kWh delivered) ------------
# [approx] SAP 10.2 Table 12; used only to reconcile EPC cost-derived delivered
# energy with the EPC's own primary-energy figure.
PEF = {"gas": 1.130, "elec": 1.501, "oil": 1.180, "lpg": 1.141, "solid": 1.064,
       "heat_network": 1.200}

# --- SAP 10.2 fuel prices (p/kWh) ---------------------------------------------
# [approx] SAP 10.2 Table 12. Only relative prices matter: the per-home total is
# rescaled to the EPC's primary energy (see energy.py).
PRICE_P_PER_KWH = {"gas": 3.64, "elec": 16.49, "elec_offpeak": 9.40, "oil": 4.94,
                   "lpg": 6.87, "solid": 4.00, "heat_network": 4.24}

# --- Performance gap: metered / EPC-modelled heating energy, by current band ---
# [approx] Few et al. 2023, Energy & Buildings 288:113024: EPCs over-predict by
# ~8% for band C and ~48% for F/G; A/B ~0, D/E interpolated [design].
GAP_BY_BAND = {"A": 1.00, "B": 1.00, "C": 0.92, "D": 0.81, "E": 0.68, "F": 0.55, "G": 0.52}
GAP_HOT_WATER = 0.90  # [design] mild hot-water over-prediction

# --- Non-SAP electricity (appliances, cooking etc.) ----------------------------
# [design] appliances_kwh = APPLIANCE_BASE * (floor_area / 80) ** APPLIANCE_AREA_EXP,
# chosen so median electricity of gas-heated homes lands near NEED 2026 (2,500 kWh, 2024).
APPLIANCE_BASE_KWH = 2050.0
APPLIANCE_AREA_EXP = 0.35
GAS_COOKING_KWH = 300.0     # [approx] typical gas hob/oven use
GAS_COOKING_SHARE = 0.5     # [approx] share of gas-heated homes cooking on gas

# --- Hidden behaviour (never exported as features) -----------------------------
SETPOINT_MEAN_C, SETPOINT_SD_C = 19.5, 1.2  # [approx] UK living-room setpoints
HEAT_PER_DEGREE = 0.10   # [approx] ~10% heating energy per 1 C of setpoint (EST rule of thumb)
OCC_SD = 0.20            # [design] lognormal sd of occupancy multiplier
APPLIANCE_SD = 0.25      # [design]
VACANT_SHARE = 0.005     # [design]
VACANT_MULT = 0.15       # [design]
ANNUAL_NOISE_SD = 0.06   # [design]
MONTHLY_NOISE_SD = 0.05  # [design]
# Share of "(assumed)" uninsulated walls that are actually insulated (undocumented
# cavity fill), and its effect on heating demand. [design]
ASSUMED_WALL_ACTUALLY_INSULATED = 0.15
ASSUMED_WALL_INSULATED_HEAT_MULT = 0.88

# Partial pooling of each home's annual energy toward the real DESNZ postcode
# metered median. Exponent 0.5 = geometric half-way, because the EPC population
# (rentals, flats) differs in composition from all meters in a postcode. [design]
DESNZ_POOL_EXP = 0.5
DESNZ_SHRINK_N = 5.0   # postcode ratio shrunk toward outcode ratio with weight n/(n+5)

# --- Solar PV -------------------------------------------------------------------
KWP_PER_M2_PANEL = 0.20      # [approx] typical monocrystalline module density
ROOF_PITCH_FACTOR = 1.22     # [approx] 1/cos(35 deg) pitched roof area per footprint
KWP_CAP = 8.0                # [design]
# [approx] PVGIS-style annual yield kWh/kWp after orientation/shading derate 0.85
PV_YIELD = {"England_SE_and_Central_S": 820, "England_SW_and_S_Wales": 830, "Midlands": 780,
            "England_NW_and_N_Wales": 750, "England_E_and_NE": 740}
# [approx] UK monthly share of annual PV yield, Jan..Dec
PV_MONTHLY_SHARE = [0.026, 0.046, 0.082, 0.112, 0.132, 0.132, 0.132, 0.116, 0.092, 0.062, 0.034, 0.022]
PV_SELF_CONSUMPTION = 0.45   # [approx] without battery
PV_FAULT_SHARE = 0.05        # [design] PV recorded on EPC but no generation (contradiction test)

# --- Fault injection -------------------------------------------------------------
FAULT_MISSING_MONTH_P = 0.04
FAULT_LONG_GAP_SHARE = 0.03
FAULT_SHORT_HISTORY_SHARE = 0.02
FAULT_BLANK_FIELD_SHARE = 0.01

# --- Retrofit simulator (labels) ---------------------------------------------------
# Fractions reduce *space-heating* demand unless stated. Calibration notes:
#   NEED 2026 (metered, first year): solid wall insulation median gas saving 17% of
#   whole-house gas; with space heating ~75% of gas this is ~22% of heating [cited+derived].
#   Other NEED medians (cavity ~8%, loft ~3%, condensing boiler ~8%) [approx, verify
#   against NEED 2026 impact-of-measures tables]. Brief illustrative ranges used where
#   NEED has no figure (glazing 8-12%, smart thermostat 5-10%).
SCOP_SPACE = 2.8   # [approx] Electrification of Heat demonstration, median SCOP ~2.8
SCOP_DHW = 2.5     # [approx]
BOILER_EFF_CONDENSING = 0.85      # [approx] in-use
BOILER_EFF_NONCONDENSING = 0.72   # [approx] in-use
PV_RETROFIT_KWP = 2.5             # matches the EPC recommendation "Solar PV, 2.5 kWp"

# Rating bands from SAP points (EPC definition)
BANDS = [(92, "A"), (81, "B"), (69, "C"), (55, "D"), (39, "E"), (21, "F"), (1, "G")]


def sap_to_band(sap):
    for lo, b in BANDS:
        if sap >= lo:
            return b
    return "G"

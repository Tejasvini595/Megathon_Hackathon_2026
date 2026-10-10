"""Optional smart-thermostat signal: a NOISY report of the home's usual heating temperature, for a share of homes.

Why it exists: the simulator gives every home a hidden thermostat setpoint (energy.py, hid["setpoint_c"]) that drives its heating use and therefore the saving from
smart controls. Nothing observable exposes it, so those savings cannot be predicted well from the visible record. A real household often does know its usual heating
temperature (and smart thermostats report it), so we expose a noisy, partial version of it as an ordinary input column.

Rules (documented in DATA.md):
  * setpoint_reported_c = hidden setpoint + N(0, SETPOINT_REPORT_SD_C), rounded to 0.5 C, clipped to 14-26 C. It is NOT the hidden value.
  * Only a random SETPOINT_REPORT_SHARE of homes have it; all others are NaN (never zero). Models must work without it.
  * It is an input only: no label is derived from it, and hidden/ must still never be used as features.
  * It uses its OWN random stream, so every other number in the dataset is byte-identical to a build without it.
  * Simulated, like the usage data. A gain in accuracy from this column reflects the simulator's design, not real-world behaviour, and must be reported with and without it.
"""
import numpy as np

SETPOINT_REPORT_SHARE = 0.30
SETPOINT_REPORT_SD_C = 0.7
STREAM = 20261011


def add_thermostat_reported(props, hid, seed):
    assert (props["property_id"].values == hid["property_id"].values).all(), "props and hidden state must be in the same order"
    rng = np.random.default_rng([seed, STREAM])
    n = len(props)
    has = rng.random(n) < SETPOINT_REPORT_SHARE            # always draw both arrays so the stream is identical whatever the data
    noise = rng.normal(0.0, SETPOINT_REPORT_SD_C, n)
    val = np.clip(np.round((hid["setpoint_c"].values + noise) * 2) / 2, 14, 26)
    out = props.copy()
    out["setpoint_reported_c"] = np.where(has, val, np.nan)
    return out

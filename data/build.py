"""Build the Green Home Twin dataset end to end.

    uv run python build.py            # full build (seeded, deterministic)
    uv run python build.py --stage A  # properties + energy only

Inputs: data/raw (see sources.md). Outputs: data/out (shippable), data/hidden (evaluation only).
"""
import argparse
import json
import time

import numpy as np
import pandas as pd

from gen import energy as E
from gen import epc
from gen.constants import SEED
from gen.paths import HIDDEN, OUT


def write(df, name, folder=OUT, csv=True):
    folder.mkdir(parents=True, exist_ok=True)
    df.to_parquet(folder / f"{name}.parquet", index=False)
    if csv:
        df.to_csv(folder / f"{name}.csv", index=False)


def stage_a(seed):
    t = time.time()
    allc = epc.load_all_certs()
    homes = epc.select_homes(allc)
    print(f"certificates {len(allc):,} -> homes {len(homes):,}  ({time.time() - t:.0f}s)")
    props, crosswalk, lookup = epc.build_properties(homes)
    props = epc.add_geo(props, seed)
    assert props["property_id"].is_unique
    rh = epc.build_retrofit_history(allc, homes, props["property_id"])
    print(f"retrofit_history events {len(rh):,}")

    rng = np.random.default_rng(seed)
    hdd = E.monthly_hdd()
    comp, hid, deliv = E.simulate_annual(props, rng)
    comp, desnz_info = E.desnz_anchor(props, comp)
    comp = E.add_solar(props, comp, rng)
    eu, faults = E.monthly(props, comp, hdd, rng)

    # Sparing injected blanks in two descriptive fields (natural missingness is used first)
    blank = rng.random(len(props)) < 0.01
    for col, typed in [("epc_windows_description", ["glazing", "glazing_level"])]:
        props.loc[blank, col] = None
        props.loc[blank, typed[0]] = "unknown"
        props.loc[blank, typed[1]] = np.nan
    faults = pd.concat([faults, pd.DataFrame({"property_id": props.loc[blank, "property_id"], "fault": "blank_field",
                                              "detail": "windows description blanked (typed glazing -> unknown)"})])

    write(props, "properties")
    write(eu, "energy_usage")
    write(rh, "retrofit_history")
    write(lookup.astype(str), "description_lookup")
    write(hdd, "monthly_hdd")
    write(epc.split_assign(props, seed), "splits")
    write(crosswalk, "crosswalk_uprn_address", HIDDEN)
    write(hid.merge(deliv.assign(property_id=props["property_id"].values), on="property_id"), "hidden_state", HIDDEN)
    write(comp, "true_annual_components", HIDDEN)
    write(faults, "fault_log", HIDDEN)
    (HIDDEN / "desnz_anchor_info.json").write_text(json.dumps(desnz_info, indent=2))
    print(f"stage A done ({time.time() - t:.0f}s)")
    return allc, homes, props, comp, hid


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=SEED)
    ap.add_argument("--stage", default="all")
    a = ap.parse_args()
    res = stage_a(a.seed)
    if a.stage == "all":
        from gen import stage_b
        stage_b.run(*res, seed=a.seed)

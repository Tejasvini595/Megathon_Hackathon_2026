"""Held-out EPC free-text descriptions with their typed fields in the web app's answer options, for benchmarking decision models
(web: bun run eval:decide). Truth comes from the dataset's typed columns, which data/gen parsed from these same texts, so the
benchmark measures agreement with that parser on real EPC wording.
    python -m greenhome.decision_eval_export out.json [--n 300]"""
import argparse, json
import numpy as np
import pandas as pd
from . import config as C

WALL = {"cavity": "cavity", "solid_brick": "solid_brick", "stone": "stone", "timber_frame": "timber", "system_built": "system"}
GLAZING = {0: "single", 1: "partial_double", 2: "mostly_double", 3: "double", 4: "high_performance", 5: "triple"}
HEATING = {"gas_boiler": "gas_boiler", "gas_warm_air": "gas_warm_air", "gas_room_heaters": "gas_room_heaters", "oil_boiler": "oil_boiler",
           "electric_storage": "electric_storage", "electric_direct": "electric_room", "heat_pump_air": "heat_pump_air",
           "heat_pump_ground": "heat_pump_ground", "community": "heat_network", "solid_fuel": "solid_fuel"}
CONTROLS = {0: "none", 1: "programmer", 2: "thermostat_trvs", 3: "smart"}
LINES = [("Walls", "epc_walls_description"), ("Roof", "epc_roof_description"), ("Floor", "epc_floor_description"), ("Windows", "epc_windows_description"),
         ("Main heating", "epc_mainheat_description"), ("Heating controls", "epc_mainheatcont_description")]


def loft(r):
    if str(r.roof_type) not in ("pitched", "roof_room"): return None
    if pd.notna(r.loft_mm): return "none" if r.loft_mm <= 0 else "thin" if r.loft_mm < 100 else "some" if r.loft_mm < 200 else "thick"
    return {"none": "none", "limited": "thin", "insulated": "thick"}.get(str(r.roof_insulation))


def main(path, n):
    p = pd.read_parquet(C.DATA / "properties.parquet").merge(pd.read_parquet(C.DATA / "splits.parquet")[["property_id", "split"]], on="property_id")
    held = p[p.split.isin(["test", "geo_test"])].sample(n, random_state=7)
    out = []
    for r in held.itertuples():
        gold = {"wallType": WALL.get(str(r.wall_type)), "wallInsulation": {0: "none", 1: "partial"}.get(r.wall_insulation_level, "full") if pd.notna(r.wall_insulation_level) else None,
                "glazing": GLAZING.get(r.glazing_level) if pd.notna(r.glazing_level) else None, "heating": HEATING.get(str(r.heating_detail)),
                "controls": CONTROLS.get(r.controls_level) if pd.notna(r.controls_level) else None, "loftInsulation": loft(r),
                "floorType": str(r.floor_type) if str(r.floor_type) in ("solid", "suspended") else None}
        out.append({"id": r.property_id, "text": "\n".join(f"{k}: {getattr(r, c)}" for k, c in LINES if isinstance(getattr(r, c), str)),
                    "gold": {k: v for k, v in gold.items() if v is not None}})
    json.dump(out, open(path, "w")); print(len(out), "EPC descriptions ->", path)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("path"); ap.add_argument("--n", type=int, default=300); a = ap.parse_args(); main(a.path, a.n)

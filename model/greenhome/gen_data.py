"""PLACEHOLDER synthetic data generator (same schema the teammate's dataset should expose).
Swap data/*.csv with the real files; nothing else in the pipeline changes.

Label-generation rules (disclosed per brief): usage comes from a simple physical model (heat demand/m2
driven by age, insulation, glazing, type, region, behaviour noise); EPC band from a SAP-style cost-factor
relation + noise; value from region price/m2 x area x type x rating effect (0.15%/SAP point) x market
index x noise; reference savings from the SAME retrofit physics as the engine but with per-property
randomised parameters and TRUE heating shares (so the engine is tested against something it cannot see).
Agreement with these synthetic targets does not establish real-world accuracy.
"""
import copy
import math
import numpy as np
import pandas as pd
from . import config as C
from .retrofits import analyse_scenario, feasibility, band_of

rng = np.random.default_rng(42)
N = 4000
REGIONS = {"London": (6500, 0.92), "South East": (4300, 0.95), "East": (3600, 0.98), "South West": (3500, 1.0),
           "Midlands": (2600, 1.02), "North West": (2300, 1.05), "Yorkshire": (2250, 1.06),
           "North East": (1900, 1.08), "Wales": (2300, 1.06), "Scotland": (2500, 1.12)}
TYPES = {"detached": (140, 35, 1.20, 1.15), "semi": (95, 20, 1.0, 0.95), "terraced": (80, 18, 0.9, 0.85),
         "bungalow": (85, 20, 1.1, 1.0), "flat": (55, 15, 0.75, 1.1)}  # area mu, sd, heat factor, price factor
TPROB = [0.18, 0.30, 0.27, 0.07, 0.18]
EFF = C.PARAMS["eff"]


def pick(d):
    return rng.choice(list(d), p=list(d.values()))


def make_property(i):
    t = rng.choice(list(TYPES), p=TPROB)
    mu, sd, hf, pf = TYPES[t]
    area = float(np.clip(rng.normal(mu, sd), 28, 300)); area = round(area, 1)
    age = int(np.clip(rng.gamma(3, 22), 2, 160))
    beds = int(np.clip(round(area / 32 + rng.normal(0, .6)), 1, 6))
    region = rng.choice(list(REGIONS))
    if age < 25: ins = pick({"average": .3, "good": .7})
    elif age < 60: ins = pick({"none": .1, "poor": .3, "average": .4, "good": .2})
    else: ins = pick({"none": .25, "poor": .4, "average": .3, "good": .05})
    if age < 25: gl = pick({"double": .85, "triple": .15})
    else: gl = pick({"single": .45, "double": .5, "triple": .05})
    hp = .02 + (.12 if age < 15 else 0)
    ht = pick({"gas_condensing": .45 - hp / 2, "gas_boiler": .35 - hp / 2, "electric": .12, "heat_pump": .08 + hp})
    solar = float(rng.choice([2, 3, 4])) if (t != "flat" and rng.random() < .10) else 0.0
    smart = int(rng.random() < .25)
    return dict(property_id=f"P{10001 + i}", property_type=t, age=age, floor_area=area, bedrooms=beds, region=region,
                heating=ht, insulation=ins, glazing=gl, solar_kwp=solar, smart_controls=smart), hf, pf


def physics(p, hf, behave):
    """True annual (elec_import, gas, heat_gas_share, heat_elec_share, hp_share) + rating-basis cost."""
    f_ins = {"none": 1.25, "poor": 1.1, "average": .85, "good": .6}[p["insulation"]]
    f_gl = {"single": 1.15, "double": 1.0, "triple": .9}[p["glazing"]]
    f_age = 1.1 if p["age"] > 60 else 1.0
    clim = REGIONS[p["region"]][1]
    dem = 105 * f_age * f_ins * f_gl * hf * clim * (0.93 if p["smart_controls"] else 1) * p["floor_area"]
    base_e = 1700 + 450 * p["bedrooms"]
    hw_e = 1500 if p["heating"] in ("electric", "heat_pump") else 0
    cop = rng.uniform(2.8, 3.4)
    gas = heat_g = heat_e = 0.0
    if p["heating"] in ("gas_boiler", "gas_condensing"):
        heat_g = dem / EFF[p["heating"]]; gas = heat_g + 2000 + 500 * p["bedrooms"] * .5; elec = base_e
    elif p["heating"] == "electric":
        heat_e = dem; elec = base_e + hw_e + dem
    else:
        heat_e = dem / cop; elec = base_e + hw_e + heat_e
    cost_rating = (elec * C.TARIFF["elec"] + gas * C.TARIFF["gas"])
    solar_off = p["solar_kwp"] * 900 * .35
    cost_rating -= solar_off * C.TARIFF["elec"]
    ecf = 0.20 * max(cost_rating, 50) / (p["floor_area"] + 45)
    sap = float(np.clip(117 - 121 * math.log10(max(ecf, 1e-3)) + rng.normal(0, 3), 1, 100))
    elec_imp = max(elec * behave - solar_off, 400)
    gas = gas * behave
    sh = dict(gas_heat_share=(heat_g * behave / gas) if gas > 0 else C.PARAMS["gas_heat_share"],
              elec_heat_share=(heat_e * behave / elec_imp) if p["heating"] == "electric" else C.PARAMS["elec_heat_share"],
              hp_heat_share=(heat_e * behave / elec_imp) if p["heating"] == "heat_pump" else C.PARAMS["hp_heat_share"])
    return elec_imp, gas, sap, sh


def noisy_params():
    P = copy.deepcopy(C.PARAMS)
    P["insul_red"] = {k: v * rng.uniform(.8, 1.2) for k, v in P["insul_red"].items()}
    P["glazing_red"] = rng.uniform(.08, .12); P["thermostat_red"] = rng.uniform(.05, .10)
    P["cop"] = rng.uniform(2.6, 3.4); P["cop_poor_insulation"] = P["cop"] * .8
    P["self_use"] = rng.uniform(.30, .42); P["self_use_hp"] = P["self_use"] + .15
    return P


def main():
    props, usage, refs, sales, hist = [], [], [], [], []
    cust = 0; left = 0
    for i in range(N):
        if left == 0:
            cust += 1; left = int(rng.choice([1, 1, 1, 2, 3]))
        left -= 1
        p, hf, pf = make_property(i)
        p["customer_id"] = f"C{cust:05d}"
        behave = float(rng.lognormal(0, .15))
        elec, gas, sap, sh = physics(p, hf, behave)
        p["energy_rating"] = band_of(sap)
        rm2, _ = REGIONS[p["region"]]
        idx = lambda y: 1 + .04 * (y - 2018)
        val_fn = lambda y, s: rm2 * p["floor_area"] * pf * (1 + .0015 * (s - 60)) * idx(y)
        noise = rng.lognormal(0, .08)
        p["current_value"] = round(val_fn(2025, sap) * noise, -3)   # baseline estimate (NOT a sale price)
        props.append(p)
        # monthly usage (2024) with explicit missingness
        miss = set()
        r = rng.random()
        if r < .01: miss = set(range(12))
        elif r < .04: miss = set(rng.choice(12, rng.integers(6, 10), replace=False))
        elif r < .15: miss = set(rng.choice(12, rng.integers(1, 3), replace=False))
        for m in range(12):
            if m in miss: continue
            usage.append(dict(property_id=p["property_id"], month=f"2024-{m+1:02d}",
                              electricity_kwh=round(elec * C.ELEC_MONTH_W[m] * rng.normal(1, .05), 1),
                              gas_kwh=round(gas * C.GAS_MONTH_W[m] * rng.normal(1, .06), 1) if gas > 0 else 0.0))
        # reference labels from the simulator (true shares, perturbed params)
        feas = feasibility(p)
        chosen = [k for k in C.ORDER if feas[k][0]]
        ref = analyse_scenario(p, elec, gas, chosen, noisy_params(), sh)
        row = dict(property_id=p["property_id"], true_elec=elec, true_gas=gas, ref_d_elec=ref["saving"]["elec"],
                   ref_d_gas=ref["saving"]["gas"], ref_improvement_pct=ref["improvement_potential_pct"],
                   ref_rating_after=ref["rating_after"], ref_carbon_kg=ref["carbon_saving_kg"])
        for s in ref["per_retrofit"]:
            row[f"ref_d_elec_{s['retrofit']}"] = s["d_elec"]; row[f"ref_d_gas_{s['retrofit']}"] = s["d_gas"]
        # reference value uplift = same price function, before/after rating (noise-free)
        sap_b, sap_a = sap, ref["sap_after"]
        row["ref_value_uplift_pct"] = 100 * (val_fn(2025, max(sap_a, sap_b)) / val_fn(2025, sap_b) - 1)
        refs.append(row)
        # sales
        for _ in range(int(rng.choice([0, 1, 1, 2, 3]))):
            y = int(rng.integers(2015, 2025)); old = rng.random() < .15 and p["energy_rating"] not in "G"
            s_at = max(1, sap - rng.uniform(5, 15)) if old else sap
            sales.append(dict(property_id=p["property_id"], date=f"{y}-{int(rng.integers(1,13)):02d}-15",
                              price=round(val_fn(y, s_at) * rng.lognormal(0, .08), -3), energy_rating_at_sale=band_of(s_at)))
        if p["solar_kwp"] > 0:
            hist.append(dict(property_id=p["property_id"], retrofit="solar", completion_date=f"{int(rng.integers(2016,2025))}-06-01"))
        if p["heating"] == "heat_pump" and p["age"] > 20:
            hist.append(dict(property_id=p["property_id"], retrofit="heat_pump", completion_date=f"{int(rng.integers(2019,2025))}-03-01"))
    C.DATA.mkdir(exist_ok=True)
    pd.DataFrame(props)[["property_id", "customer_id", "property_type", "age", "floor_area", "bedrooms", "region",
                         "energy_rating", "heating", "insulation", "glazing", "solar_kwp", "smart_controls",
                         "current_value"]].to_csv(C.DATA / "properties.csv", index=False)
    pd.DataFrame(usage).to_csv(C.DATA / "energy_usage.csv", index=False)
    pd.DataFrame(refs).to_csv(C.DATA / "reference_labels.csv", index=False)
    pd.DataFrame(sales).to_csv(C.DATA / "sales_history.csv", index=False)
    pd.DataFrame(hist).to_csv(C.DATA / "retrofit_history.csv", index=False)
    pd.DataFrame([dict(fuel="elec", kg_co2e_per_kwh=C.EMISSION_FACTORS["elec"], source=C.EMISSION_SOURCE),
                  dict(fuel="gas", kg_co2e_per_kwh=C.EMISSION_FACTORS["gas"], source=C.EMISSION_SOURCE)]
                 ).to_csv(C.DATA / "emissions_factors.csv", index=False)
    pd.DataFrame([dict(retrofit=k, label=v["label"], cost_fixed=v["fixed"], cost_per_m2=v["per_m2"],
                       cost_per_kwp=v["per_kwp"]) for k, v in C.RETROFITS.items()]
                 ).to_csv(C.DATA / "retrofit_catalogue.csv", index=False)
    print(f"wrote {len(props)} properties, {len(usage)} usage rows, {len(sales)} sales")


if __name__ == "__main__":
    main()

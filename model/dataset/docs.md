# Green Home Twin dataset: guide for model training

129,318 real homes from EPC certificates in 10 councils (Barnet, Birmingham, Bristol, Camden, Cardiff, City of London, Croydon, Liverpool, Manchester, Newcastle upon Tyne). Certificates were lodged Sep 2025 – Sep 2026 and are augmented with real sales, real postcode-level meter statistics and a documented simulator. The full methodology is in `data/DATA.md`; the checks are in `validation_report.md`.

**Read first:**
1. Join everything on `property_id` (string, e.g. `PE2CC48575C`). There is one row per home in `properties`.
2. **Always use `splits.parquet`.** Train on `train`, tune on `val`, report on `test`, and report `geo_test` (Liverpool, a city no model has seen) separately. The split is grouped by postcode, so don't re-split randomly.
3. **Missing = NaN, never 0.** In `energy_usage`, NaN is a missing reading. 0 means the home has no such supply (e.g. no gas).
4. Simulated data is labelled (`energy_usage.source = "simulated"`, labels files). Matching simulated targets does not prove real-world accuracy; say so in the evaluation.
5. `data/hidden/` is not shared and must never be used as features.

```python
import pandas as pd
props  = pd.read_parquet("properties.parquet")
energy = pd.read_parquet("energy_usage.parquet")
splits = pd.read_parquet("splits.parquet")
df = props.merge(splits[["property_id", "split"]], on="property_id")
train = df[df.split == "train"]
```

## Files at a glance

| File | Rows | Grain | Origin |
| --- | --- | --- | --- |
| `properties` | 129,318 | home | Real EPC + derived columns + value estimate |
| `energy_usage` | 3,103,632 | home × month (24 months, 2024-10 to 2026-09) | Simulated |
| `splits` | 129,318 | home | train 76,098 · val 17,281 · test 16,808 · geo_test 19,131 |
| `sales_history` | 30,413 | sale | Real (Land Registry), matched to 24,647 homes |
| `labels_retrofit` | 1,163,862 | home × retrofit (9) | Simulated savings + real EPC recommendations |
| `labels_package` | 129,318 | home | Simulated package outcome + real EPC potential |
| `labels_package_sequence` | 1,163,862 | home × retrofit | Simulated marginal savings in fabric-first order |
| `labels_value` | 129,318 | home | Real-sales rating premium applied to EPC potential |
| `epc_recommendations` | 276,752 | home × recommendation | Real (RdSAP software output) |
| `retrofit_history` | 1,711 | event | Real (differences between repeat certificates) |
| `retrofit_catalogue` | 9 | retrofit | Rules, impacts, costs (from EPC indicative costs) |
| `emissions_factors` | 4 | fuel | DESNZ 2025 |
| `monthly_hdd` | 2,160 | climate region × month (1991–2026) | Met Office HadUK-Grid → heating degree days |
| `description_lookup` | 437 | raw EPC string | How every EPC description string maps to typed columns |

---

## properties (one row per home)

**Identity and location**

| Column | Meaning |
| --- | --- |
| `property_id`, `customer_id` | Keys (one customer per home) |
| `postcode`, `outcode` | Real postcode (47,493 distinct) and its outward code (199) |
| `local_authority`, `local_authority_code`, `constituency`, `region_code`, `country` | Admin geography (England/Wales) |
| `climate_region` | Met Office region, joins to `monthly_hdd` |
| `lat`, `lon` | Postcode centroid + ~40 m jitter (map display; fine as a coarse location feature) |
| `lsoa`, `msoa`, `admin_ward`, `geo_source` | Small-area geography from postcodes.io |

**Building** (real EPC unless noted)

| Column | Meaning |
| --- | --- |
| `property_type` | House / Flat / Maisonette / Bungalow / Park home |
| `built_form` | Detached / Semi-Detached / Mid-Terrace / End-Terrace / Enclosed… / `unknown` (~37%, mostly flats where EPC records "Not Recorded") |
| `age_band`, `age_year_est` | EPC construction band and its midpoint year (derived) |
| `floor_area` | Total floor area, m² |
| `habitable_rooms` | Real; **use this rather than `bedrooms_est`** (rooms − 1, display only) |
| `floor_level`, `flat_top_storey`, `storeys_est` | Flats' floor (NaN for houses); storeys is derived |

**Energy rating** (real EPC)

| Column | Meaning |
| --- | --- |
| `sap_score` (1–100), `energy_rating` (A–G) | Current SAP and band; band always matches SAP |
| `potential_sap`, `potential_rating` | RdSAP's modelled rating after its recommended measures |
| `epc_primary_kwh_m2`, `epc_primary_kwh_m2_potential`, `epc_co2_t` | EPC modelled primary energy and CO2 (not metered) |
| `epc_heating_cost_current`, `epc_hot_water_cost_current`, `epc_lighting_cost_current` | EPC modelled annual costs, £ |

**Fabric and systems** (derived from the EPC text by rules; the raw text is kept in `epc_*_description`)

| Column | Values |
| --- | --- |
| `wall_type` | cavity, solid_brick, stone, system_built, timber_frame, other |
| `wall_insulation`, `wall_insulation_level` | none(0), partial(1), as_built_insulated / filled_cavity / internal / external(2), filled_plus(3) |
| `wall_assumed`, `roof_assumed` | True when the EPC says "(assumed)", meaning the assessor did not inspect |
| `roof_type` | pitched, flat, roof_room, thatched, dwelling_above, premises_above, same_dwelling_above |
| `roof_insulation`, `loft_mm`, `loft_depth_known` | `loft_mm` only when a depth is stated (NaN otherwise, e.g. "insulated (assumed)" or a flat below another dwelling) |
| `floor_type`, `floor_insulation` | solid / suspended / … ; none / limited / insulated / not_applicable |
| `glazing`, `glazing_level` | single(0), partial_double(1), mostly_double(2), double/secondary(3), high_performance(4), triple(5) |
| `heating` | gas_boiler, electric, community, heat_pump, oil, lpg, gas_other, solid_fuel, unknown |
| `heating_detail`, `heating_fuel`, `boiler_condensing`, `heating_assumed` | Finer system type; condensing is inferred from the EPC efficiency rating |
| `hot_water_source`, `hot_water_fuel`, `hot_water_offpeak` | Hot water system |
| `controls_level`, `controls_label`, `smart_controls` | 0 none, 1 basic, 2 programmer + thermostat/TRVs, 3 zone control. **EPC has no smart-thermostat field**: `smart_controls` = level 3 |
| `has_solar_pv` | Real; **None = unknown** (photo_supply blank), not "no" |
| `photo_supply_pct`, `solar_kwp_est` | % of roof with PV (real) and estimated kWp (derived) |
| `solar_water_heating`, `mechanical_ventilation`, `open_fireplaces`, `low_energy_lighting_pct`, `main_fuel`, `mains_gas_flag`, `energy_tariff` | As recorded |

**Other**

| Column | Meaning |
| --- | --- |
| `fuel_scope` | `gas_elec` (119,479; the brief's grid + gas accounting applies), `heat_network` (8,829), `other_fuel` (1,008), `no_heating` (2) |
| `tenure`, `transaction_type`, `lodgement_date`, `inspection_date` | Why and when the EPC was done |
| `flag_*` | Natural data-quality flags: no UPRN, floor area < 20 m², implausible rooms, missing tenure, missing photo_supply |
| `current_value_estimate` | £ at 2026-07. Last real sale indexed with UK HPI (19% of homes), else the hedonic model |
| `value_source` | `last_sale_hpi_indexed` / `hedonic_model` / `hedonic_model_sale_outlier` |
| `value_model_estimate` | Hedonic model estimate for every home (the baseline to beat) |

## energy_usage (home × month)

`electricity_kwh` = grid import (after solar self-consumption). Also `gas_kwh`, `heat_network_kwh` (community heat), `other_fuel_kwh` (oil/LPG/solid), `solar_generation_kwh`, and `source`.

- Annual medians: gas 10,107 kWh (NEED 10,000); electricity for gas-heated homes 2,228 kWh. These track the real DESNZ postcode medians (Spearman 0.79 gas, 0.69 electricity).
- **Faults are deliberate test cases:**
    - ~6% of months are NaN: random gaps, long 3–8-month gaps, and 2,531 homes with only 2–5 summer months, which must be reported as "unavailable";
    - 182 PV homes show no generation (a contradiction with the EPC);
    - 1% of homes have the windows description blanked.
- **Annualise** from the months present with degree-day adjustment (`monthly_hdd` via `climate_region`). Report "unavailable" when there are fewer than 6 months or no Dec–Feb month. Never sum NaN as 0.

## splits

`property_id`, `postcode_group`, `split` ∈ {train, val, test, geo_test}. It is grouped by postcode, so no postcode is in two splits. Liverpool is entirely `geo_test`.

## sales_history (real)

`date`, `price` (£), `property_type_lr` (D/S/T/F), `new_build` (Y/N), `tenure_lr` (F/L), `energy_rating_at_sale`, `hpi_factor`, `price_indexed_valuation`.

- `energy_rating_at_sale` is known for 5,526 sales and otherwise `unknown`. Never guess it.
- `price_indexed_valuation` = price × HPI(2026-07) / HPI(sale month), for the same council × type. Use it as a time-adjusted target.
- Standard (category A) sales between £25k and £15M only.

## labels_retrofit (home × retrofit)

Retrofits are `loft_insulation`, `cavity_wall_insulation`, `solid_wall_insulation`, `floor_insulation`, `double_glazing`, `smart_controls`, `heat_pump`, `condensing_boiler` and `solar_pv`.

| Column | Meaning |
| --- | --- |
| `feasible` | Hard rules (`retrofit_catalogue.applicability_rule`); only `gas_elec` homes |
| `elec_saving_kwh`, `gas_saving_kwh` | Saving if applied **alone** to the home's true state; **negative = increase** (a heat pump raises electricity) |
| `co2_saving_kg` | Using `emissions_factors` |
| `relevance` | High (≥10% of baseline grid + gas), Medium (≥3%), Low, not_feasible |
| `epc_recommended`, `epc_recommendation_available` | Whether the real EPC recommended a mapped measure (a real reference label) |

The simulator knows hidden facts the EPC doesn't (e.g. 15% of "no insulation (assumed)" walls are actually insulated). A model that perfectly copies the EPC will therefore not be perfect on these labels. This is deliberate.

## labels_package (home)

- **Package:** feasible measures applied in fabric-first order, with a heat pump replacing a boiler upgrade where feasible. Columns: per-fuel before/after/saving, `co2_saving_kg` and `measures_applied`.
- **`improvement_potential_pct`:** 100 × (E_before − E_after) / E_before, with E = grid import + gas. Median 62%; it is dominated by heat pumps, which cut purchased kWh ~57%.
- **`improvement_potential_pct_no_heat_pump`:** the same package without a heat pump (median 14%). Better for fabric-led ranking.
- **Unavailable values:** NaN, with `improvement_potential_unavailable_reason` (non-gas_elec scope or zero baseline).
- **`epc_potential_improvement_pct`:** a real independent reference from the EPC's own potential figures. Spearman 0.69 with the no-heat-pump version.
- **Ranks:** `improvement_rank`, `improvement_rank_no_heat_pump` (1 = most potential).

## labels_package_sequence

The marginal per-fuel saving of each measure in the package order (`applied` = in the package for this home). Use it to show interactions: the savings are not additive.

## labels_value (home)

`rating_before`/`sap_before` → `rating_after`/`sap_after` (EPC potential). `uplift_pct_low/mid/high` and `uplift_gbp_low/high`.

These come from a premium fitted on 5,187 real sales with a known rating at sale: **+4.2% per 10 SAP points, 95% CI 3.1–5.3%**, with outcode fixed effects. **Associational, not causal.**

## Reference tables

- **`retrofit_catalogue`:** rule, impact model, impact source, indicative cost low/high (£, median of real EPC indicative costs), `fabric_first_order`.
- **`emissions_factors`** (DESNZ 2025, kg CO2e/kWh): electricity 0.19553 (0.177 generation + 0.01853 T&D), gas 0.18296 (gross CV), burning oil, LPG.
- **`monthly_hdd`:** `climate_region`, `month`, `tmean_c`, `hdd` (base 15.5 °C).
- **`epc_recommendations`:** real RdSAP recommendations with `mapped_retrofit` (NaN for measures outside our 9, e.g. lighting or hot-water cylinder).
- **`retrofit_history`:** real upgrades between successive certificates. `completion_date` is an upper bound.
- **`description_lookup`:** audit of every raw EPC string → typed values (all stored as strings).

---

## Suggested models: targets, features, baselines, leakage traps

| Model | Target | Good features | **Do not use as features** | Baseline to beat |
| --- | --- | --- | --- | --- |
| SAP / rating predictor (rating after a retrofit edits the features) | `sap_score` | Typed fabric/heating columns, property type, built form, age, floor area, rooms, location, (EPC text) | `energy_rating`, `potential_*`, `epc_primary_kwh_m2*`, `epc_co2_t`, `epc_*_cost_current`: all computed from the SAP calculation itself | Mean SAP by age band × property type |
| Baseline consumption predictor (for homes without meter data) | Annualised gas and electricity from `energy_usage` (annualise yourself) | Everything in `properties` except value columns | `labels_package.*_before_kwh` (true annual values, i.e. the answer) | Median by property type × floor-area band (NEED-style) |
| Value model | `sales_history.price_indexed_valuation` (latest sale per home) | Location, type, built form, area, rooms, age, SAP | `current_value_estimate`, `value_model_estimate`, `value_source` (built from these same sales) | Outcode median £/m² × floor area (median APE 16.8%; our LightGBM reaches 12.4%) |
| Retrofit relevance / recommender | `labels_retrofit.relevance` or `epc_recommended` | Typed fabric/heating columns, consumption features | `labels_*` savings columns | Popularity: recommend the most common feasible measures |
| Poor-home ranking | `improvement_rank_no_heat_pump` (or with heat pump) | Score sub-components, intensity | `labels_package` columns | Rank by EPC rating alone |

**Always:**
- fit only on `train` and report `test` and `geo_test` separately;
- treat `has_solar_pv = None` and `loft_mm = NaN` as unknown, not zero;
- respect `fuel_scope` (only `gas_elec` homes get grid + gas metrics);
- show electricity and gas separately.

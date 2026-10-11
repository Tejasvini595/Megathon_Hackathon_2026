# Held-out test predictions: schema and label documentation

Deliverable I. This documents `reports/test_predictions.parquet`: the engine's predictions for the held-out homes, next to the reference labels they are evaluated against. Sources: `greenhome/train.py` (`_eval_home` and the engine-evaluation loop), `dataset/docs.md`, `model_implementation.md` section 19.

## What a row is

One row is one held-out home, analysed by the engine on **dataset inputs** (the engine run for the evaluation in `metrics.json`, not the web-app customer path). The engine's default package is applied to the home: all feasible measures in fabric-first order, with a heat pump replacing a boiler upgrade where feasible (a second figure, `impr_nohp`, is for the package without a heat pump). The file holds the engine's outputs and, beside them, the reference labels from `dataset/labels_package.parquet`, `dataset/labels_value.parquet` and `dataset/properties.parquet`.

`property_id` is unique in the file (no property appears twice, and the splits are grouped by postcode, so no postcode appears in both splits).

## Splits and size

32,265 rows and 47 columns.

| `split` | Rows in file | Homes in the split (`splits.parquet`) | Meaning |
|---|---|---|---|
| `test` | 15,214 | 16,808 | Held-out test split |
| `geo_test` | 17,051 | 19,131 | Liverpool, a city held out completely |

Only homes with `usage_status = metered` and `fuel_scope = gas_elec` are evaluated (the engine's savings accounting covers grid electricity and gas), which is why the file has fewer rows than the splits. Train and validation homes are not in this file. 154 rows have an empty `measures` (no feasible measure selected).

## Columns

Units: energy in kWh per year; carbon in kg CO2e per year (emissions factors: electricity 0.19553, gas 0.18296 kg CO2e/kWh, DESNZ 2025); percentages in percentage points; money in GBP. Saving sign convention: positive = a saving, negative = an increase (a heat pump raises electricity).

### Identity

| Column | Type | Meaning |
|---|---|---|
| `property_id` | string | Dataset home id (synthetic hash id, e.g. `PC2FCF2787F`); the join key to every dataset table |
| `split` | string | `test` or `geo_test` |

### Engine outputs (predictions)

| Column | Type | Unit | Meaning |
|---|---|---|---|
| `score` | int | 0-100 | Green Home Score now (documented weighted formula) |
| `classification` | string | | Class from the score: Highly efficient, Good, Moderate, Poor, Very poor |
| `d_elec` | float | kWh/yr | Engine's grid-electricity saving for the default package (negative = increase) |
| `d_gas` | float | kWh/yr | Engine's gas saving for the default package |
| `carbon_kg` | float | kg CO2e/yr | Engine's carbon saving for the default package |
| `impr` | float | % | Engine's improvement potential of the default package: 100 x (E_before - E_after) / E_before, with E = grid import + gas |
| `impr_nohp` | float | % | The same for the package without a heat pump |
| `sap_before` | float | SAP points | SAP before (the recorded EPC rating) |
| `sap_after` | float | SAP points | Engine's simplified SAP after the package (never below `sap_before`) |
| `rating_after` | string | band | EPC band for `sap_after` |
| `measures` | string | | Measure ids of the engine's default package, joined by `+` (empty when none is feasible) |
| `package_cost_gbp` | float | GBP | Mid-point of the catalogue's indicative cost range, summed over the package |
| `mc_e10`, `mc_e90` | float | kWh/yr | Monte Carlo P10 and P90 of the package's electricity saving |
| `mc_g10`, `mc_g90` | float | kWh/yr | P10 and P90 of the gas saving |
| `mc_i10`, `mc_i90` | float | % | P10 and P90 of the improvement potential |
| `mc_c10`, `mc_c90` | float | kg CO2e/yr | P10 and P90 of the carbon saving |
| `uplift_low`, `uplift_mid`, `uplift_high` | float | % | Engine's indicative property-value uplift range for the package, from the rating premium applied to the SAP gain. Associational, not causal. In this file `uplift_low` is 0 for every row |

Monte Carlo columns (`mc_*`) are filled only for the first 2,000 homes evaluated in each split, and only when the package is non-empty (100 draws each); they are empty for the other rows (28,266 empty values in this file). They reflect parameter uncertainty only. Coverage of the P10-P90 range against the reference savings is in `metrics.json` under `monte_carlo_coverage`.

### Reference labels (what predictions are compared with)

| Column | Type | Unit | Meaning |
|---|---|---|---|
| `elec_import_before_kwh`, `gas_before_kwh` | float | kWh/yr | Simulated true annual electricity import and gas before |
| `elec_import_after_kwh`, `gas_after_kwh` | float | kWh/yr | Simulated true values after the reference package |
| `elec_saving_kwh`, `gas_saving_kwh` | float | kWh/yr | Simulated per-fuel saving of the reference package (negative = increase) |
| `co2_saving_kg` | float | kg CO2e/yr | Carbon saving using the emissions factors |
| `improvement_potential_pct` | float | % | 100 x (E_before - E_after) / E_before for the reference package |
| `improvement_potential_unavailable_reason` | string | | Reason when unavailable (non-gas+electricity scope or zero baseline); empty for every row here because only gas+electricity metered homes are included |
| `measures_applied` | string | | Measures in the reference package, joined by `+`. Equals `measures` in 96.6% of rows: the reference package is built by the simulator on the home's true state, the engine's on what the record shows |
| `improvement_potential_pct_no_heat_pump`, `elec_saving_kwh_no_heat_pump`, `gas_saving_kwh_no_heat_pump` | float | % / kWh/yr | The same reference without a heat pump |
| `epc_potential_improvement_pct` | float | % | Improvement implied by the real EPC's own potential figures (a real, independent reference) |
| `improvement_rank`, `improvement_rank_no_heat_pump` | float | rank | Rank of the home by reference improvement potential across the dataset (1 = most potential) |
| `uplift_pct_low`, `uplift_pct_mid`, `uplift_pct_high` | float | % | Reference value uplift from the real-sales rating premium applied to the EPC potential. Associational, not causal |
| `ref_sap_after` | int | SAP points | EPC potential SAP used for the value label (`labels_value.sap_after`) |
| `potential_sap` | int | SAP points | The real EPC's modelled SAP after its recommended measures |
| `sap_score` | int | SAP points | The recorded EPC SAP score |

## How the labels were obtained

The rules are disclosed in `data/DATA.md`; summary:

| Target columns | Origin |
|---|---|
| `elec_*`, `gas_*`, `co2_saving_kg`, `improvement_potential_pct*`, ranks | **Simulated.** The package is the feasible measures applied in fabric-first order (heat pump replacing a boiler upgrade where feasible) on the home's true state, including hidden facts the EPC does not hold (thermostat setpoint, occupancy, appliance load; for walls recorded as "no insulation (assumed)", 15% are actually insulated). Impacts use the retrofit catalogue's rules and impact model; carbon uses the DESNZ factors. Monthly usage that these builds on is simulated, anchored to real EPC primary energy and partially pooled toward real DESNZ postcode-level medians |
| `epc_potential_improvement_pct`, `potential_sap`, `sap_score` | **Real** EPC fields (the EPC's own potential figures) |
| `uplift_pct_*`, `ref_sap_after` | **Real-sales-based.** A premium fitted on 5,187 real sales with a known rating (+4.2% per 10 SAP points, 95% CI 3.1-5.3%, outcode fixed effects) applied to the EPC potential SAP. The dataset premium was fitted on all sales, including held-out ones, so it is not used as ground truth for the value range; the independent check is `heldout_premium_check` in `metrics.json` |
| `score`, `classification` | Computed by the engine from the home's inputs; no label |

The engine and the simulator both use the catalogue's impact percentages and SCOP. Agreement between `d_*` and the simulated `*_saving_kwh` columns is therefore partly circular and shows consistency, not real-world accuracy. The independent comparison is the engine's SAP gain against `potential_sap - sap_score` (correlation 0.69 on `test` and 0.70 on `geo_test` for the engine applied to the measures the real EPC recommended; `metrics.json`, `independent_epc_check`). Synthetic labels do not establish real-world predictive accuracy.

## Not available at prediction time

These are in the file for evaluation only and are never inputs to the engine or the models:

- every reference label above: `elec_import_after_kwh`, `gas_after_kwh`, the `*_saving_kwh` columns, `co2_saving_kg`, `improvement_potential_pct*`, `improvement_rank*`, `uplift_pct_*`, `measures_applied`;
- the EPC "potential" fields: `potential_sap`, `ref_sap_after`, `epc_potential_improvement_pct`;
- the simulator's hidden state (not in the file; `dataset/hidden/` is never read at inference).

`elec_import_before_kwh` and `gas_before_kwh` are simulated true annual values; for these metered homes the engine's baseline is the annualised metered usage (`model_implementation.md` section 4). `sap_score` (the recorded rating) is an engine input.

`dataset/` keeps current value separate from history: `current_value_estimate` is the baseline estimate and `sales_history` holds the real past sales; neither is a column here.

## How it is generated

`greenhome/train.py` runs `_eval_home` for each metered gas+electricity home of each split in `SPLITS`, joins the reference labels (`labels_package`, `labels_value`) and the EPC fields, and writes the `test` and `geo_test` rows:

```
pd.concat(preds)[lambda z: z.split.isin(["test", "geo_test"])].to_parquet(C.REPORTS / "test_predictions.parquet")
```

To regenerate (needs the dataset in `model/dataset/`; models use fixed seeds and output is identical for any number of workers):

```
cd model
uv sync
uv run python -m greenhome.train          # rewrites models/ and reports/ including this file
# or everything: uv run python -m greenhome.run_all
```

To inspect:

```
uv run python -c "import pandas as pd; d=pd.read_parquet('reports/test_predictions.parquet'); print(d.shape); print(d.split.value_counts())"
```

## Metrics computed from this file

`metrics.json` (`engine_vs_reference`, `independent_epc_check`, `monte_carlo_coverage`) reports, per split, the mean absolute error of `d_elec`, `d_gas` and `carbon_kg` against the reference columns, the rank correlation of `impr` with `improvement_potential_pct`, the baseline of ranking by EPC rating alone, the SAP-gain correlation with the EPC, and the Monte Carlo coverage. Headline results are in `model_implementation.md` section 19.

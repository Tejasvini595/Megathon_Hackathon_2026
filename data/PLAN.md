# Dataset Generation Plan

**STATUS (2026-10-10 21:20): BUILT.** See DATA.md, sources.md, out/validation_report.md (20/20 pass). Build: `uv run python build.py` (deterministic).

## Revision 6 (FINAL, after Plan review): the shared doc "Green Home Twin: Dataset Build Plan" is now the source of truth
https://claude.ai/code/artifact/e092e557-73c8-4996-be7a-053c8c7f3947 (main tab = plan, "Plan review" tab = review)

Key changes vs Revision 5:
- Energy is anchored on EPC (primary energy / SAP PEF per fuel), corrected by band x type x area to NEED metered levels, plus NEED appliance electricity, hidden behaviour and an HDD monthly shape. The homemade geometry/physics step is dropped.
- NEED medians are 10,000 kWh gas / 2,500 kWh elec (NEED June 2026, 2024 data). 11,500 / 2,700 were Ofgem's old TDCVs.
- fuel_scope column: gas_elec / heat_network (heat_network_kwh) / other_fuel (unsupported) / no_heating.
- Value labels come from 5,423 real sales with a known rating at sale. Matched-sale current value covers ~24% of homes; ~76% are model estimates (flagged).
- EPC potential fields are the second improvement-potential reference and rating_after.
- Catalogue calibrated to NEED metered savings by measure.
- Hidden fabric mismatch applies only to "(assumed)" entries; solar flags taken from EPC as recorded (blank = unknown).
- retrofit_history from the 3,153 multi-certificate UPRNs; customer_id 1:1.
- Splits grouped by postcode + Liverpool geo test. Ship property_id only; UPRN in an internal crosswalk; simulated rows tagged.
- DESNZ 2025 factors (elec incl. T&D, gas gross CV); HDD from Energy Trends ch.7 / HadUK-Grid.
- DESNZ postcode-level domestic gas + electricity 2024 in raw/desnz/ (real metered annual mean/median per postcode, outcode "All postcodes" rows as fallback). Coverage of our postcodes: electricity 97%, gas 90%. Annual simulated energy is anchored to the home's postcode median, then spread by EPC demand; NEED band correction still applies.
- Full EPC history: optional, to be downloaded by a teammate and integrated after the mid-submission.
- Time: about 2-2.5 h.

---


## Revision 5 (FINAL, supersedes earlier revisions where they conflict)

**Raw data layout**
```
raw/epc/batch2/certificates.csv      143,257 certs, 10 LAs, lodged 2025-09-01..2026-09-30  <- USE THIS
raw/epc/batch2/recommendations.csv   EPC recommendations for batch2
raw/epc/batch1/                       earlier 8-LA download; strict subset of batch2 (redundant, kept for provenance)
raw/epc/sample_national_2026Q3.csv    1,000-row national sample (distribution reference only)
raw/landregistry/pp-2015..2026.csv    Price Paid, all England & Wales
raw/landregistry/UK-HPI-full-file-2026-07.csv
```

**Coverage:** 10 local authorities across 6 regions: London (Barnet, Croydon, Camden, City), North West (Manchester, Liverpool), West Midlands (Birmingham), South West (Bristol), **North East (Newcastle)**, **Wales (Cardiff)**. That covers the coldest English climate and a second nation (Welsh EPCs use the same schema).

**After filters** (existing-dwelling RdSAP only, latest certificate per UPRN): **129,318 homes**. Ratings: C 78.3k, D 39.0k, B 6.6k, E 4.2k, F 651, G 233, A 384.

**Splits:** 70/15/15 by property over 9 LAs, plus **Liverpool held out entirely** as the unseen-city test.

**Sales and value:** Price Paid 2015–2026 (12 years) filtered to our postcodes, matched to EPC homes on postcode + normalised PAON/SAON. Values are brought to Jul 2026 with UK HPI by LA × property type. The earlier years raise the match rate (homes that sold any time since 2015, not just in the last year) and allow the repeat-sales check. Sale-time rating comes only from an EPC that existed at the sale date, otherwise "unknown" (our EPC file only covers 2025–26, so most past sales have unknown rating_at_sale; disclosed).

---


## Revision 4 (FINAL, supersedes Revision 3 where they conflict)

- **Coverage:** the brief has no national-coverage requirement. It only says to "account for location" in value and to discuss bias. We use **all 8 local authorities already downloaded**, spanning 4 English regions: London, North West, West Midlands, South West. Optional add-on: Newcastle upon Tyne (North East, coldest climate) + Cardiff (Wales), same date range, certificates + recommendations.
- **No sampling.** Use every existing-dwelling RdSAP certificate (report_type 2, not a new dwelling), deduplicated by UPRN keeping the latest → **112,637 homes**, including 4,524 rated E/F/G. Nothing to reweight or justify. A 10k demo subset is used only for the frontend and map.
- **Filters, with reasons for judges:**
  1. Exclude new dwellings / SAP reports: they are design-stage assessments of unoccupied homes, with no usage history and not retrofit candidates.
  2. One record per UPRN (latest certificate): one home = one row, which prevents the same home landing in both train and test.
  3. Known limitation: EPCs are lodged when a home is sold, let or surveyed, so rentals and social housing are over-represented compared with the whole housing stock.
- **Splits:** 70/15/15 by property across 7 LAs, plus **Liverpool held out entirely** as an unseen-city test.
- **Columns:** the teammate's schema is fully covered. Derived fields: bedrooms ≈ habitable rooms − 1 (EPC has no bedroom count); age = band plus midpoint year; smart_controls = level parsed from the controls text, plus a bool; solar_kwp from photo_supply. energy_usage keeps missing months as NaN rows.
- **Simulator ownership:** the label-generating "true" simulator lives in data/ and uses hidden parameters. The team's estimation engine is separate, so we aren't grading the engine against itself.
- **Time:** v1 tables (properties + energy_usage + reference tables) in about 1 h. Labels, sales, validate.py and DATA.md take about +45 min. Coordinates come from the postcodes.io bulk API (no 1 GB UPRN download). Model training is not included; it takes seconds on this data.

---


## Revision 3 (FINAL): augment real EPC data. Overrides everything below.

### Downloaded data (EPC open data, lodged 2025-09-01 to 2026-09-30)
- `92364491-….csv`: **124,613 certificates**, same 93-column schema as the sample. Local authorities: Birmingham 36.9k, Manchester 24.0k, Liverpool 20.3k, Bristol 12.5k, Barnet 11.5k, Croydon 11.3k, Camden 7.6k, City of London 0.4k. UPRN present for 98%.
- `0fe72b73-….csv`: **250,496 recommendations** for 103,716 certificates (improvement_id, summary, description, indicative_cost). Most common: solar PV, wall insulation, floor insulation, cavity fill, low-energy lighting, loft to 270 mm, glazing, heating controls, boiler replacement.
- **Main set:** Manchester + Bristol + London (Barnet, Croydon, Camden, City), excluding new dwellings → **61,379 certificates**. Ratings: C 38.1k, D 17.3k, B 3.6k, E 1.9k, F 275, G 91, A 80. Heat pumps 1,042, solar 1,054, single glazing 2,733. Floor area and age band never blank.
- **Birmingham + Liverpool** (about 55k) are kept as a **held-out geography test set** (do we generalise to unseen cities?).

### Taken from the real data
Property attributes (type, built form, age band, floor area, rooms, floor level), SAP score and rating, the free-text wall/roof/floor/window/heating/controls/hot-water descriptions, main fuel, gas-grid flag, solar share, tenure, lodgement date, postcode, local authority, constituency, region, UPRN, EPC modelled energy/CO2/costs (used only as features or cross-checks), and **EPC recommendations as real labels for retrofit relevance**.

### Selection of 10,000 properties
Remove duplicates by UPRN (keep the latest certificate). Then take a **stratified sample**: keep every E/F/G home (about 2.3k), fill the rest proportionally by rating × LA × property type. Weights are documented so stock-level statistics can be re-weighted.

### Derived from the real data (deterministic and documented)
- Typed features parsed from the descriptions (wall type and insulation, loft mm, glazing, heating system, controls, solar kWp from photo_supply × roof area). Built with regex rules now; Jev/LLM parsing evaluated against these later.
- Geometry: element areas from floor area, built form, storeys, floor level.
- Coordinates: **OS Open UPRN** (OGL) via UPRN → lat/long. Falls back to the postcodes.io centroid. Works with OpenStreetMap.

### Generated (synthetic, seeded, disclosed)
1. **Hidden behaviour/state** per home: thermostat setpoint, occupancy, true air leakage, true vs recorded insulation (out-of-date EPC for about 10%), appliance load, real boiler efficiency.
2. **Monthly gas and electricity**, 2024-10 to 2026-09 (24 months), from a physics model on each real home + hidden state + regional degree days, calibrated to NEED medians. Solar generation is stored separately.
3. **Data faults** (logged): missing months, long gaps, homes with under 6 months of data, blanked fields, contradictions, vacant homes.
4. **Value:** `current_value_estimate` plus `sales_history`. Preferred: real **HM Land Registry Price Paid** matched by postcode + PAON (match rate reported). Unmatched homes get synthetic sales from a hedonic formula. The current value is kept separate and marked as an estimate.
5. **customer_id, retrofit_history** (small).
6. **Labels:** per-retrofit feasibility and per-fuel savings plus package improvement potential (simulator on the hidden true state), value uplift band, and relevance (real EPC recommendations).
7. **Reference tables:** emissions factors (DESNZ 2025, cited), monthly HDD by region, retrofit catalogue.

### Privacy and licence
Shipped tables drop address1–3 and the full address. They keep postcode, UPRN and coordinates. A house number is kept internally only for the Land Registry match. EPC data is OGL except address fields (Royal Mail/OS restrictions). Land Registry and OS Open UPRN are OGL.

### Outputs
`data/out/`: properties, energy_usage, retrofit_catalogue, emissions_factors, monthly_hdd, sales_history, retrofit_history, epc_recommendations, labels_*, splits (property-level 70/15/15 + geo holdout). `data/hidden/`: hidden params and fault log, never used as features. `DATA.md`, `sources.md`, `validate.py`.

### Time estimate (one person, with me writing the code): about 2–2.5 h
| Step | Time |
| --- | --- |
| venv, load, clean, dedupe, sample | 20 min |
| Description parsers → typed features + geometry | 30 min |
| Coordinates (OS Open UPRN subset / postcodes.io) | 15 min |
| Hidden state + monthly energy simulator + calibration | 35 min |
| Faults, sales/value (Land Registry if the download is quick), labels, splits | 30 min |
| validate.py + DATA.md + sources.md | 20 min |

Parallel for teammates now: scoring mappings + monotonicity tests (against the typed columns listed above), API/dashboard skeleton, LLM prompt, and a Land Registry download for the 6 LAs (ppd extract, filter by postcode).

---


## Revision 2 (after reviewing the EPC sample in data.csv). This section overrides the sections below where they conflict.

**What the sample is:** 1,000 real EPC certificates lodged Jul–Sep 2026, England and Wales, 93 columns (the current EPC open-data schema).

**Findings that change the plan**
1. **Recent certificates skew good.** Ratings: C 51%, D 27%, B 14%, A 4%, E 4%, F 0.5%, G 0%. That's because 14% are new dwellings. Even without them, only about 5% of homes are E/F. If we copied this, there would be almost no Poor homes, and the brief is about finding and fixing Poor ones.
   → Each synthetic home gets a `lodgement_date` spread over 2012–2026. Older certificates were done before upgrades, so they rate worse and are often out of date compared with the home today. That gives us Poor homes for the brief while staying explainable, and the "outdated EPC" cases come from the same mechanism.
2. **The rating band always follows from the SAP score** (0 mismatches in the sample): A ≥92, B 81–91, C 69–80, D 55–68, E 39–54, F 21–38, G ≤20. The generator works out SAP first and then the band.
3. **The fabric and heating descriptions are free text in EPC wording** (e.g. "Cavity wall, as built, no insulation (assumed)", "Pitched, 100 mm loft insulation", "Boiler and radiators, mains gas", "Programmer, room thermostat and TRVs"). We produce these strings from the typed hidden state, using the real phrasing and its frequencies by age band. The typed columns are kept too, so we can check our parsing of the text against them later (the "Jev normalisation" evaluation is free).
4. **Real conditional patterns we'll match** (sample, existing homes):
   - 1900–1929 / pre-1900: mostly solid brick, no insulation.
   - 1930–1975: cavity walls, mostly filled now, some still unfilled.
   - 1983+: built with insulated cavities.
   - Roof: loft depths given as 100/150/200/250/270/300/400+ mm, or "(another dwelling above)" for flats.
   - Windows: fully double glazed 72%, high performance 20%, single 2%.
   - Heating: mains gas boiler about 75%, community heating 6%, electric storage or room heaters about 10%, heat pumps about 4%, oil 2%.
   - Tenure: owner 47%, social rent 24%, private rent 17%.
   - Solar (`photo_supply`, % of roof): 0 for 79%.
   - Floor area q10/50/90 = 45/76/129 m². SAP q10/50/90 = 60/72/86. Habitable rooms median 4.
5. **Property type is two fields:** `property_type` (House/Flat/Bungalow/Maisonette) × `built_form` (Detached/Semi/Mid- and End-Terrace). Flats have `floor_level` and a top-floor flag. The geometry and heat-loss rules use these.

**Revised approach: "EPC-shaped synthetic"**
- `properties.csv` uses the **real EPC column names and vocabularies** for the fields we need: postcode, posttown, local_authority, constituency, region (ONS code), property_type, built_form, construction_age_band, total_floor_area, number_habitable_rooms, floor_level, walls/roof/windows/mainheat/mainheatcont/hotwater descriptions, main_fuel, mains_gas_flag, photo_supply, tenure, current_energy_efficiency (SAP), current_energy_rating, lodgement_date, transaction_type.
- We add the brief's own fields: property_id, customer_id, plus typed fields (heating, insulation, glazing, solar_kwp, smart_controls) and current_value_estimate.
- The real sample is only used to fit distributions. **No real row, address or UPRN is copied** (privacy and licence). Its licence terms go in sources.md.
- **10,000 properties** in 3 regions: London (E12000007), North West / Greater Manchester (E12000002), South West / Bristol (E12000009). The mix of property types differs by region (London is mostly flats).

**Postcodes and OpenStreetMap for the app**
- Each property gets a **real postcode** in its region from postcodes.io, under the Open Government Licence. The cache in `raw/postcodes.csv` holds postcode, latitude/longitude, outward code, local authority (with its ONS code), constituency, LSOA, ward and region.
- Address is a synthetic house number plus a **real street name near that postcode**, from OSM (via Overpass, cached in `raw/osm_streets.csv`). The app can geocode it and show it on OSM tiles. We don't fake UPRNs. Coordinates are the postcode centroid plus a small jitter, so homes don't stack on one point on the map.
- Optional, if time allows: OSM building footprints for the postcode, to feed the 3D twin later.

**Things that stay the same:** the cause-and-effect ordering, the hidden parameters (setpoint, occupancy, true air leakage, true insulation vs the EPC's), the monthly physics with NEED-calibrated totals, the deliberate faults, sales from the Land Registry schema with the current value kept separate, labels from the simulator using the true state, and property-level splits.

**New checks before we accept the data** (`validate.py`, written up in DATA.md):
- Generated distributions vs the EPC sample (existing homes, lodged 2024–26): rating mix, SAP and floor-area quantiles, wall type by age band. Older certificates should be visibly worse.
- Annual gas and electricity vs NEED medians.
- Every rating band must be consistent with its SAP score.
- A home built like P10001 should score about 38, Poor.

---


Status: draft for team review. Nothing is generated yet.

## 0. Decision: UK, not India

Model the dataset on **England** (with real UK postcodes), not India.

| Concern | UK | India |
| --- | --- | --- |
| Problem statement's own concepts | EPC rating A–G, SAP score, gas boilers, loft insulation, heat pumps, £ values, all UK | No domestic EPC scheme, no piped gas heating for most homes, heating demand is close to zero in most cities (cooling dominates) |
| Datasets we're told to model after | EPC, NEED, Land Registry, London Smart Meter: all UK | None equivalent |
| Emissions factors | DESNZ GHG conversion factors (official, citable) | CEA grid factor exists, but no gas-heating equivalent |
| Judges' sanity check (P10001: E, gas boiler, single glazing → 38 Poor) | Directly reproducible | Doesn't map |
| Postcodes and OpenStreetMap | UK postcodes have public lat/long centroids (ONS Postcode Directory / postcodes.io, Open Government Licence); OSM coverage of the UK is excellent | Works too, but this isn't a reason to switch |

So pincode/OSM compatibility doesn't argue for India: every property gets a **real UK postcode with a real lat/long**, which works with OSM, Leaflet, deck.gl and any geocoder.

## 1. What we model it after

Each synthetic table copies the schema and marginal distributions of a real public source, so judges can check plausibility.

| Our table | Modelled after | What we borrow |
| --- | --- | --- |
| properties | EPC domestic certificates (England) + English Housing Survey (EHS) | Field vocabulary (property type, built form, age band, floor area, rating, SAP, wall/roof/window/heating descriptions), joint distributions (age band → fabric) |
| energy_usage (monthly) | NEED consumption tables + London Smart Meter seasonal shape | Annual medians/quartiles by type, floor area band and age; winter/summer profile |
| postcodes | ONS Postcode Directory via postcodes.io (OGL) | Real postcode, district, lat/long, region, LSOA |
| monthly_hdd | Published UK regional degree-day series (cite source; synthetic placeholder until found) | Monthly heating degree days by region, base 15.5 °C |
| sales_history | HM Land Registry Price Paid Data | Schema (price, date, property type, new build, tenure), regional price levels |
| emissions_factors | DESNZ 2025 GHG conversion factors | Real values, cited with year and version |
| retrofit_catalogue | Brief's table + EPC recommendations vocabulary + published cost guides | Measure names, applicability, cost ranges, impact ranges |

Every number lifted from a source goes in `data/sources.md` with a link and access date. Figures marked **[verify]** below are planning values from memory and must be checked before shipping.

## 2. Scope and size

- **10,000 properties** (see Revision 2) across **3 regions** for climate and price variety:
  - Greater London (high prices, mild climate, many flats)
  - Greater Manchester / North West (cooler, older terraces)
  - Bristol / South West (mixed)
- **24 months** of usage: 2023-10 to 2025-09 (two full heating seasons, so the annualisation logic has something to work with).
- One seeded script; `python data/generate.py --seed 42 --n 5000` reproduces everything byte for byte.

## 3. Generation order (causal chain)

Draw variables in causal order so correlations are plausible, never independently:

```
region → postcode (real, sampled from postcodes.io cache)
       → property_type | region            (London: more flats)
       → age_band | type, region
       → floor_area | type, bedrooms
       → as-built fabric | age_band        (pre-1919: solid walls, single glazing)
       → past upgrades | age, value        (loft topped up, cavity filled, double glazing…)
       → heating system | type, region, gas grid
       → solar, smart controls | type, tenure, value
       → SAP score = simplified SAP-like formula(fabric, heating, area) + noise → energy_rating band
       → hidden behaviour params (never exported to model-visible tables)
       → monthly gas and electricity from the hidden "true" physics model
       → current_value_estimate and sales_history from a hedonic formula
       → labels from the simulator using the true (hidden) state
```

### Approximate target marginals (England, EHS/EPC) [verify]

| Variable | Distribution |
| --- | --- |
| property_type | detached 17%, semi 26%, terrace 28%, flat 21%, bungalow 8% (London: flats ~50%) |
| age_band | pre-1919 20%, 1919–44 16%, 1945–64 19%, 1965–80 20%, 1981–90 8%, 1991–2002 8%, 2003+ 9% |
| floor_area_m2 | log-normal by type: flat ~60, terrace ~85, semi ~90, detached ~140 |
| heating | gas boiler ~85% (split condensing vs old non-condensing by install year), electric storage/resistance ~8%, oil ~2%, heat pump ~2%, other ~3% |
| glazing | full double ~80%, partial ~10%, single ~5%, triple ~1–2% (older homes skew single/partial) |
| loft insulation | none / <100 mm / 100–200 / 200–270 / 270+, by age and whether upgraded |
| walls | solid uninsulated, solid insulated, cavity unfilled, cavity filled, timber/system; mostly set by age band |
| solar PV | ~5% of houses, near 0% of flats, kWp 2–5 |
| smart controls | none 25%, timer/programmer 50%, smart thermostat 20%, zoned 5% |
| energy_rating (result) | A/B ~3%, C ~40%, D ~40%, E ~13%, F/G ~4%; check the result lands near this |
| annual gas | median ~11,500 kWh, IQR ~8k–15k [NEED] |
| annual electricity | median ~2,700 kWh [NEED] |

The SAP formula is internal to the generator and documented; it is deliberately **simpler than / different from** whatever our scoring and engine use.

## 4. Hidden parameters (the anti-circularity layer)

Stored only in `data/hidden/hidden_params.csv`, flagged as unavailable at prediction time, never used as model features:

- thermostat setpoint (normal, mean 19.5 °C, sd 1.2)
- occupants and occupancy pattern (home all day vs working)
- true infiltration (ACH)
- true insulation state, which differs from the EPC record for ~10% of homes (EPC outdated: upgrade done after the certificate, or EPC optimistic)
- appliance baseload, hot-water demand
- boiler real-world efficiency (degraded vs nameplate)

Monthly consumption is generated from these, so the performance gap exists in the data for the engine to discover.

## 5. Monthly energy model (generator side)

Per property per month:

- `space_heat = H_true × HDD_month(region, setpoint-adjusted) × 24 / 1000`
- `gas = (space_heat + hot_water + cooking) / boiler_eff_true` (zero if not on gas)
- `electricity = appliance_base × seasonal_shape + lighting + electric heating (if any) + heat pump load (space_heat / COP_month) − solar_self_consumed`
- `solar_generation = kWp × monthly_yield(region) ` (stored separately; only self-consumption reduces imports)
- multiplicative log-normal noise ~8%

Then calibrate global scalars so annual totals hit the NEED medians and spreads above.

## 6. Realism and test-case injection

Deliberate, logged in `data/hidden/injections.csv` so the evaluation can find them:

| Injection | Rate |
| --- | --- |
| Random missing months (row absent, not zero) | ~5% of property-months |
| Long gap (3–8 consecutive months) | ~4% of properties |
| Under 6 months of data / no winter month → "unavailable" | ~2% of properties |
| Missing property fields (e.g. glazing, loft depth blank) | ~3% per field |
| Contradiction: EPC says solar, no generation in data | ~0.5% |
| Contradiction: floor area implausible for bedrooms | ~0.5% |
| Outdated EPC (fabric changed after certificate) | ~10% (via hidden params) |
| Zero/near-zero baseline (vacant home) | ~0.5% |
| Off-gas-grid homes (oil/electric) | natural share, for heat pump and gas = 0 cases |

## 7. Property value and sales

- `price = £/m²(postcode district) × floor_area × type_factor × age_factor × rating_premium × market_index(date) × noise`
- District £/m² levels seeded from published regional averages [verify]; rating premium a few % per band, consistent with published EPC–price studies (cited, described as associational).
- `sales_history`: 0–3 past sales per property, 2005–2025, with `energy_rating_at_sale` (worse than today if upgrades happened since).
- `current_value_estimate` (baseline, as of 2025-09) is a separate column in `properties`; historical sale prices are never used as the baseline.

## 8. Labels (reference targets)

Produced by applying each catalogue retrofit to the **true hidden state** with the generator physics (richer than our engine's estimator):

- `labels_retrofit.csv`: property_id, retrofit_id, feasible (rule-based), relevance (High/Medium/Low from simulated saving share), elec_saving_kwh, gas_saving_kwh (negative = increase)
- `labels_package.csv`: property_id, package of feasible measures applied fabric-first in sequence, per-fuel after-consumption, improvement_potential_pct (null when baseline is zero/missing, with reason)
- `labels_value.csv`: property_id, rating_before, simulated rating_after, uplift_pct_low/high from the hedonic formula

All rules disclosed in `DATA.md`, with the statement that agreement with synthetic targets doesn't establish real-world accuracy.

## 9. Output files

```
data/
  generate.py             single seeded entry point
  config.yaml             all distributions and constants, each with a source key
  sources.md              citations and access dates
  DATA.md                 schema, generation rules, label rules, limitations, prediction-time flags
  raw/postcodes.csv       cached from postcodes.io (fetched once, committed)
  raw/monthly_hdd.csv
  out/properties.csv
  out/energy_usage.csv
  out/retrofit_catalogue.csv
  out/emissions_factors.csv
  out/retrofit_history.csv
  out/sales_history.csv
  out/splits.csv          property-level 70/15/15 + optional held-out postcode district
  out/labels_*.csv
  hidden/                 hidden params and injection log (evaluation only; never features)
```

## 10. Splits and leakage

- Group split by property_id (customer_id = one per property for now), 70/15/15, seed 42, saved to `splits.csv`.
- Optional geographic test: one whole postcode district held out.
- `DATA.md` lists fields unavailable at prediction time: everything in `hidden/`, sales after 2025-09, labels, post-retrofit ratings.

## 11. Build steps (about 2 hours)

1. Fetch and cache ~5k real postcodes for the 3 regions (15 min).
2. `config.yaml` with marginals and constants (20 min).
3. Property generator + SAP formula; check rating distribution (30 min).
4. Monthly energy model + calibration against NEED medians; check P10001 (30 min).
5. Injections, sales, labels, splits (30 min).
6. `DATA.md` + validation plots/summary table (15 min).

## 12. Open decisions for the team

1. UK confirmed? (Recommended.)
2. Three regions as above, or one city (simpler map demo)?
3. 5,000 properties OK? (Big enough for ML, small enough for the 3D/map.)
4. OK to call postcodes.io once at build time and commit the cache (keeps generation offline and reproducible afterwards)?

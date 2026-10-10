# Sources and licences

All inputs are public. Accessed 2026-10-10 unless stated.

| Data | Local path | Source | Licence | Used for |
| --- | --- | --- | --- | --- |
| EPC domestic certificates + recommendations, lodged 2025-09-01 to 2026-09-30, 10 councils | `raw/epc/batch2/` | MHCLG Energy Performance of Buildings data (get-energy-performance-data.communities.gov.uk) | OGL v3, except address fields (Royal Mail / OS copyright: used internally for matching only, not shipped) | Properties, descriptions, recommendations, retrofit history |
| EPC national sample, Jul–Sep 2026 (1,000 rows) | `raw/epc/sample_national_2026Q3.csv` | as above | as above | Distribution reference only |
| HM Land Registry Price Paid Data, 2015–2026 | `raw/landregistry/pp-*.csv` | [gov.uk Price Paid Data](https://www.gov.uk/government/statistical-data-sets/price-paid-data-downloads) | OGL v3 | `sales_history`, value model, rating premium |
| UK House Price Index full file (to Jul 2026) | `raw/landregistry/UK-HPI-full-file-2026-07.csv` | [HM Land Registry UK HPI](https://www.gov.uk/government/collections/uk-house-price-index-reports) | OGL v3 | Indexing sales to the valuation month |
| DESNZ postcode-level domestic gas 2024 | `raw/desnz/Postcode_level_gas_2024.csv` | [Postcode level gas statistics 2024](https://www.gov.uk/government/statistics/postcode-level-gas-statistics-2024) | OGL v3 | Local anchoring and validation of simulated gas |
| DESNZ postcode-level electricity (all meters) 2024 | `raw/desnz/Postcode_level_all_meters_electricity_2024.csv` | [Postcode level electricity statistics 2024](https://www.gov.uk/government/statistics/postcode-level-electricity-statistics-2024) | OGL v3 | Local anchoring and validation of simulated electricity |
| DESNZ GHG conversion factors 2025 (flat file) | `raw/desnz_ghg/` | [Conversion factors 2025](https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2025) | OGL v3 | `emissions_factors`: electricity 0.177 (generation) + 0.01853 (T&D) = 0.19553; natural gas 0.18296 kg CO2e/kWh (gross CV) |
| NEED: Summary of Analysis, June 2026 | `raw/need/NEED-report-june-2026.pdf` | [DESNZ NEED report](https://assets.publishing.service.gov.uk/media/6a2925376d178a6fb7e31fe8/NEED-report-june-2026.pdf) | OGL v3 | Benchmarks: median gas 10,000 kWh, electricity 2,500 kWh (2024, E&W); solid wall insulation 17% median gas saving; ~105 kWh/m² for 51–150 m² houses |
| Met Office HadUK-Grid regional monthly mean temperature | `raw/metoffice/` | [Met Office UK climate series](https://www.metoffice.gov.uk/research/climate/maps-and-data/uk-and-regional-series) | OGL v3 | Monthly heating degree days (Hitchin formula, base 15.5 °C) |
| Postcode geography (lat/long, LSOA, ward) | `raw/postcodes/postcodes.csv` | [postcodes.io](https://postcodes.io) (ONS Postcode Directory) | OGL v3 / ONS licence | Coordinates for the map |
| Few et al. 2023, *Energy and Buildings* 288:113024 | n/a | [UCL Discovery](https://discovery-pp.ucl.ac.uk/id/eprint/10167970) | n/a | EPC over-prediction by band (performance gap) |

## Approximate constants (to verify before final submission)

These are tagged `[approx]` in `gen/constants.py`:
- SAP 10.2 primary energy factors and fuel prices (Table 12). Used only for relative splits.
- PV yields per region and the monthly PV shape (PVGIS-style).
- Heat pump SCOP 2.8 (Electrification of Heat demonstration).
- In-use boiler efficiencies.
- NEED medians for cavity, loft and boiler savings (the 2026 report gives these in figures, not text).
- The 10%-per-°C setpoint rule.

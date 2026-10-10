# Extraction evaluation

Extractor: `rules-v0` · 2026-10-10 · 26 hand-written descriptions, 212 labelled fields, text input only.

## Headline

| Metric | Value |
| --- | --- |
| Macro accuracy (mean of per-field accuracy) | 82.9% |
| Micro accuracy (all labelled fields) | 85.4% |
| Coverage (labelled fields filled from the text, not defaulted) | 79.2% |
| Accuracy when filled from the text | 93.5% |
| Expected calibration error | 7.7% |
| False fills (fields the text leaves open but the extractor filled) | 1 |

## Per field

| Field | Labelled | Accuracy | Coverage |
| --- | --: | --: | --: |
| propertyType | 25 | 96.0% | 44.0% |
| builtForm | 24 | 95.8% | 100.0% |
| bedrooms | 24 | 75.0% | 66.7% |
| ageBand | 21 | 71.4% | 76.2% |
| wallType | 14 | 100.0% | 100.0% |
| wallInsulation | 10 | 60.0% | 50.0% |
| glazing | 23 | 91.3% | 91.3% |
| heating | 23 | 91.3% | 95.7% |
| controls | 4 | 100.0% | 100.0% |
| floorAreaM2 | 6 | 100.0% | 100.0% |
| loftInsulationMm | 6 | 100.0% | 100.0% |
| roofType | 4 | 75.0% | 100.0% |
| secondaryHeating | 6 | 100.0% | 100.0% |
| flatLevel | 7 | 85.7% | 71.4% |
| blockStoreys | 7 | 42.9% | 14.3% |
| storeys | 4 | 75.0% | 75.0% |
| solarPv | 4 | 50.0% | 100.0% |

## Calibration

Tiers match the review screen: Sure at 0.85 and above, Likely at 0.6 and above, Guess below.

| Tier | Fields | Accuracy | Mean confidence |
| --- | --: | --: | --: |
| Sure | 146 | 93.8% | 90.2% |
| Likely | 22 | 90.9% | 79.5% |
| Guess | 44 | 54.5% | 35.0% |

## Misses (31)

| Case | Field | Gold | Got | Confidence | Source |
| --- | --- | --- | --- | --: | --- |
| victorian-terrace-leeds | bedrooms | 2 | 3 | 0.35 | default |
| 1930s-semi-filled-cavity | wallInsulation | full | none | 0.35 | default |
| 1970s-detached-oil | bedrooms | 4 | 3 | 0.35 | default |
| 1970s-detached-oil | glazing | partial_double | double | 0.90 | text |
| ground-flat-victorian-conversion | bedrooms | 1 | 3 | 0.35 | default |
| ground-flat-victorian-conversion | heating | electric_room | gas_boiler | 0.88 | text |
| top-flat-tower-block | blockStoreys | 12 | 4 | 0.35 | default |
| top-flat-tower-block | bedrooms | 2 | 3 | 0.35 | default |
| newbuild-flat-district-heating | blockStoreys | 8 | 4 | 0.35 | default |
| newbuild-flat-district-heating | bedrooms | 1 | 3 | 0.35 | default |
| maisonette-over-shop | flatLevel | top | mid | 0.35 | default |
| maisonette-over-shop | blockStoreys | 3 | 4 | 0.35 | default |
| maisonette-over-shop | storeys | 2 | 3 | 0.90 | text |
| newbuild-detached-heat-pump | wallInsulation | full | none | 0.35 | default |
| edwardian-end-terrace-stove | ageBand | 1900_1929 | pre1900 | 0.82 | text |
| edwardian-end-terrace-stove | wallInsulation | partial | full | 0.85 | text |
| edwardian-end-terrace-stove | glazing | partial_double | double | 0.90 | text |
| messy-semi-fifties | ageBand | 1950_1966 | 1930_1949 | 0.35 | default |
| messy-flat-above-chippy | heating | electric_storage | gas_boiler | 0.35 | default |
| loft-topped-up-last-winter | bedrooms | 2 | 3 | 0.35 | default |
| heat-pump-single-glazing | ageBand | 1983_1995 | 1930_1949 | 0.35 | default |
| third-floor-flat-1930s-block | blockStoreys | 5 | 4 | 0.35 | default |
| basement-flat-georgian | builtForm | flat | mid_terrace | 0.80 | text |
| basement-flat-georgian | ageBand | pre1900 | 1930_1949 | 0.35 | default |
| rural-bungalow-stove | solarPv | no | yes | 0.85 | text |
| townhouse-heat-network | wallInsulation | full | none | 0.35 | default |
| 1980s-terrace-storage-gas-fire | propertyType | house | flat | 0.93 | text |
| 1980s-terrace-storage-gas-fire | roofType | gable | flat | 0.90 | text |
| cold-cottage-open-fire | ageBand | pre1900 | 1930_1949 | 0.35 | default |
| 2000s-detached-no-solar | ageBand | 1996_2011 | 1930_1949 | 0.35 | default |
| 2000s-detached-no-solar | solarPv | no | yes | 0.85 | text |

## False fills

| Case | Field | Filled with |
| --- | --- | --- |
| almost-nothing-bought-2021 | ageBand | 2012_plus |

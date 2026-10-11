# Extraction evaluation

Extractor: `rules-v0` · 2026-10-11 · 32 hand-written descriptions, 249 labelled fields, text input only.

## Headline

| Metric | Value |
| --- | --- |
| Macro accuracy (mean of per-field accuracy) | 100.0% |
| Micro accuracy (all labelled fields) | 100.0% |
| Coverage (labelled fields filled from the text, not defaulted) | 95.6% |
| Accuracy when filled from the text | 100.0% |
| Expected calibration error | 17.0% |
| False fills (fields the text leaves open but the extractor filled) | 0 |

## Per field

| Field | Labelled | Accuracy | Coverage |
| --- | --: | --: | --: |
| propertyType | 27 | 100.0% | 70.4% |
| builtForm | 29 | 100.0% | 100.0% |
| rooms | 28 | 100.0% | 96.4% |
| ageBand | 25 | 100.0% | 100.0% |
| wallType | 14 | 100.0% | 100.0% |
| wallInsulation | 10 | 100.0% | 100.0% |
| glazing | 24 | 100.0% | 100.0% |
| heating | 26 | 100.0% | 100.0% |
| controls | 4 | 100.0% | 100.0% |
| floorAreaM2 | 6 | 100.0% | 100.0% |
| loftInsulation | 9 | 100.0% | 100.0% |
| roofType | 4 | 100.0% | 100.0% |
| flatLevel | 7 | 100.0% | 100.0% |
| blockStoreys | 7 | 100.0% | 71.4% |
| storeys | 4 | 100.0% | 100.0% |
| solarPv | 7 | 100.0% | 100.0% |
| solarKw | 4 | 100.0% | 100.0% |
| epcBand | 2 | 100.0% | 100.0% |
| sapScore | 2 | 100.0% | 100.0% |
| boilerAge | 3 | 100.0% | 100.0% |
| thermostatC | 2 | 100.0% | 100.0% |
| currentValueGbp | 1 | 100.0% | 100.0% |
| floorType | 2 | 100.0% | 100.0% |
| floorInsulation | 2 | 100.0% | 100.0% |

## Calibration

Tiers match the review screen: Sure at 0.85 and above, Likely at 0.6 and above, Guess below.

| Tier | Fields | Accuracy | Mean confidence |
| --- | --: | --: | --: |
| Sure | 180 | 100.0% | 89.2% |
| Likely | 58 | 100.0% | 72.9% |
| Guess | 11 | 100.0% | 35.0% |

## Misses (0)

| Case | Field | Gold | Got | Confidence | Source |
| --- | --- | --- | --- | --: | --- |

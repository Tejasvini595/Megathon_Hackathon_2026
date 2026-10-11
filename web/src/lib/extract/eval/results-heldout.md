# Extraction evaluation

Extractor: `rules-v0` · 2026-10-11 · 14 hand-written descriptions, 103 labelled fields, text input only.

## Headline

| Metric | Value |
| --- | --- |
| Macro accuracy (mean of per-field accuracy) | 90.6% |
| Micro accuracy (all labelled fields) | 89.3% |
| Coverage (labelled fields filled from the text, not defaulted) | 79.6% |
| Accuracy when filled from the text | 97.6% |
| Expected calibration error | 12.9% |
| False fills (fields the text leaves open but the extractor filled) | 1 |

## Per field

| Field | Labelled | Accuracy | Coverage |
| --- | --: | --: | --: |
| propertyType | 14 | 100.0% | 57.1% |
| builtForm | 7 | 100.0% | 100.0% |
| ageBand | 14 | 71.4% | 64.3% |
| wallType | 7 | 100.0% | 100.0% |
| wallInsulation | 5 | 80.0% | 60.0% |
| glazing | 8 | 75.0% | 100.0% |
| heating | 11 | 100.0% | 100.0% |
| boilerAge | 4 | 100.0% | 75.0% |
| controls | 4 | 75.0% | 75.0% |
| rooms | 3 | 100.0% | 66.7% |
| storeys | 2 | 50.0% | 50.0% |
| flatLevel | 4 | 100.0% | 100.0% |
| blockStoreys | 3 | 66.7% | 33.3% |
| floorAreaM2 | 2 | 100.0% | 100.0% |
| loftInsulation | 4 | 75.0% | 75.0% |
| roofType | 1 | 100.0% | 100.0% |
| floorType | 2 | 100.0% | 100.0% |
| floorInsulation | 1 | 100.0% | 0.0% |
| solarPv | 3 | 100.0% | 100.0% |
| solarKw | 2 | 100.0% | 100.0% |
| epcBand | 1 | 100.0% | 100.0% |
| sapScore | 1 | 100.0% | 100.0% |

## Calibration

Tiers match the review screen: Sure at 0.85 and above, Likely at 0.6 and above, Guess below.

| Tier | Fields | Accuracy | Mean confidence |
| --- | --: | --: | --: |
| Sure | 67 | 97.0% | 89.6% |
| Likely | 15 | 100.0% | 75.3% |
| Guess | 21 | 57.1% | 35.0% |

## Misses (11)

| Case | Field | Gold | Got | Confidence | Source |
| --- | --- | --- | --- | --: | --- |
| ho-ex-council-semi | wallInsulation | full | none | 0.35 | default |
| ho-georgian-townhouse | storeys | 4 | 2 | 0.35 | default |
| ho-bungalow-oil | ageBand | 1967_1975 | 1930_1949 | 0.35 | default |
| ho-bungalow-oil | glazing | mostly_double | single | 0.92 | text |
| ho-top-floor-electric | ageBand | 1983_1990 | 1930_1949 | 0.35 | default |
| ho-no-solar-negation | ageBand | 1900_1929 | 1930_1949 | 0.35 | default |
| ho-no-solar-negation | loftInsulation | none | some | 0.35 | default |
| ho-district-heating | blockStoreys | 20 | 4 | 0.35 | default |
| ho-district-heating | ageBand | 1967_1975 | 1930_1949 | 0.35 | default |
| ho-voice-style | glazing | partial_double | single | 0.92 | text |
| ho-ground-source | controls | smart | thermostat_trvs | 0.35 | default |

## False fills

| Case | Field | Filled with |
| --- | --- | --- |
| ho-top-floor-electric | flatRoofInsulation | full |

# Extraction evaluation

Extractor: `rules-v0 + llm:z-ai/glm-5.3-flash + decide:perplexity/pplx-decider-v1.1-27b` · 2026-10-11 · 14 hand-written descriptions, 103 labelled fields, text input only.

## Headline

| Metric | Value |
| --- | --- |
| Macro accuracy (mean of per-field accuracy) | 95.2% |
| Micro accuracy (all labelled fields) | 92.2% |
| Coverage (labelled fields filled from the text, not defaulted) | 98.1% |
| Accuracy when filled from the text | 93.1% |
| Expected calibration error | 4.9% |
| False fills (fields the text leaves open but the extractor filled) | 2 |

## Per field

| Field | Labelled | Accuracy | Coverage |
| --- | --: | --: | --: |
| propertyType | 14 | 85.7% | 100.0% |
| builtForm | 7 | 100.0% | 100.0% |
| ageBand | 14 | 78.6% | 100.0% |
| wallType | 7 | 100.0% | 100.0% |
| wallInsulation | 5 | 100.0% | 100.0% |
| glazing | 8 | 87.5% | 100.0% |
| heating | 11 | 100.0% | 100.0% |
| boilerAge | 4 | 100.0% | 100.0% |
| controls | 4 | 100.0% | 100.0% |
| rooms | 3 | 100.0% | 100.0% |
| storeys | 2 | 100.0% | 100.0% |
| flatLevel | 4 | 100.0% | 100.0% |
| blockStoreys | 3 | 66.7% | 33.3% |
| floorAreaM2 | 2 | 100.0% | 100.0% |
| loftInsulation | 4 | 75.0% | 100.0% |
| roofType | 1 | 100.0% | 100.0% |
| floorType | 2 | 100.0% | 100.0% |
| floorInsulation | 1 | 100.0% | 100.0% |
| solarPv | 3 | 100.0% | 100.0% |
| solarKw | 2 | 100.0% | 100.0% |
| epcBand | 1 | 100.0% | 100.0% |
| sapScore | 1 | 100.0% | 100.0% |

## Calibration

Tiers match the review screen: Sure at 0.85 and above, Likely at 0.6 and above, Guess below.

| Tier | Fields | Accuracy | Mean confidence |
| --- | --: | --: | --: |
| Sure | 85 | 94.1% | 91.0% |
| Likely | 16 | 87.5% | 74.4% |
| Guess | 2 | 50.0% | 35.0% |

## Misses (8)

| Case | Field | Gold | Got | Confidence | Source |
| --- | --- | --- | --- | --: | --- |
| ho-bungalow-oil | glazing | mostly_double | single | 0.92 | text |
| ho-epc-quoted | ageBand | 1950_1966 | 1967_1975 | 0.92 | text |
| ho-no-solar-negation | propertyType | house | flat | 0.60 | text |
| ho-no-solar-negation | ageBand | 1900_1929 | pre1900 | 0.60 | text |
| ho-no-solar-negation | loftInsulation | none | thin | 0.92 | text |
| ho-district-heating | blockStoreys | 20 | 4 | 0.35 | default |
| ho-voice-style | propertyType | house | bungalow | 0.92 | text |
| ho-ground-source | ageBand | 2007_2011 | 2012_2021 | 0.92 | text |

## False fills

| Case | Field | Filled with |
| --- | --- | --- |
| ho-georgian-townhouse | solarPv | no |
| ho-top-floor-electric | flatRoofInsulation | full |

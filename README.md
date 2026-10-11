# Green Home Twin

Megathon X, Lloyds Problem Statement 2: Green Home Score and Retrofit Recommendation Engine.

Green Home Twin is a homeowner app with a 3D "twin" of the home, backed by a Python engine. The user describes their home in any form (text, voice, photos, a floor plan, a bill), checks the extracted record, and the app shows the home's score, where heat is lost, a retrofit plan with savings and value, and answers what-if questions. The models and formulas calculate every score, saving, carbon and value figure; the language model only explains them (the brief's core rule, enforced in the code: see [ARCHITECTURE.md](ARCHITECTURE.md)).

## The four customer questions

| Question | Where the app answers it |
|---|---|
| How green is my home now? | `/home/[id]`: twin hero, score ring, score breakdown, where-heat-goes bars, performance gap, key issues |
| What should be improved? | `/plan/[id]`: ordered retrofit plan with the Today/After toggle; key issues and next step on `/home/[id]` |
| How much energy and carbon would that save? | `/plan/[id]`: per-fuel savings (negative = increase), carbon, bill change, monthly-cost illustration; `/energy/[id]` for energy tiles |
| Could it add value? | `/plan/[id]`: value range (indicative, associational) |

What-if questions go through `/ask/[id]`: the engine re-runs, then the LLM explains the new numbers.

## Repo layout

| Path | Contents |
|---|---|
| `web/` | Next.js 16 app (App Router, React Three Fiber, Better Auth, Prisma 7, Postgres). See [web/README.md](web/README.md) |
| `model/` | Python engine: `greenhome/` package, `api.py` (FastAPI service for the web app), `app.py` (Streamlit dashboard), `models/` (trained models and reference tables), `reports/` (metrics and test predictions), `tests/`. See [model/README.md](model/README.md) and [model/model_implementation.md](model/model_implementation.md) |
| `data/` | Dataset build: `build.py`, `gen/`, `validate.py`, `DATA.md` (schema and rules), `sources.md` (sources and licences). Generated parquet/CSV files are gitignored |

## Run everything from scratch

### 1. Postgres

```sh
podman run -d --name ght-postgres -e POSTGRES_USER=ght -e POSTGRES_PASSWORD=ght -e POSTGRES_DB=ght \
  -p 5432:5432 -v ght-pg:/var/lib/postgresql/data docker.io/library/postgres:17-alpine
# or, from web/: docker compose up -d   (compose.yaml)
```

### 2. Engine

```sh
cd model
uv sync                                    # versions pinned in pyproject.toml / uv.lock
uv run uvicorn api:app --port 8000
```

The trained models are committed in `model/models/`, together with copies of the small reference tables (catalogue, emissions factors, heating degree days) and `customer_reference.json`, so the web engine runs without the dataset (`GreenEngine(lite=True)`). If neither `dataset/` nor `models/` has a needed table, the read fails loudly. The advisor ranking (`/portfolio`) needs `uv run python -m greenhome.service_portfolio` once.

The dataset is not committed. To retrain you need it in `model/dataset/`: build it with `data/build.py` (raw sources: `data/sources.md`) or copy an existing `out/` folder. Then:

```sh
uv run python -m greenhome.run_all         # train + evaluate -> benchmark table -> tests -> explanation-layer evaluation
uv run streamlit run app.py                # optional Streamlit dashboard
```

App models only (SAP estimator and app relevance, about 2 minutes): `uv run python -m greenhome.app_models`.

### 3. Web app

```sh
cd web
bun install                      # also runs `prisma generate`
cp .env.example .env             # then fill BETTER_AUTH_SECRET (openssl rand -base64 32); set ENGINE_URL="http://localhost:8000"
bunx prisma migrate dev          # creates tables
bun run db:postcodes ../data/raw/postcodes/postcodes.csv   # postcodes from our dataset
bun run db:seed                  # demo user with three confirmed homes (idempotent)
bun run dev                      # http://localhost:3000, open with phone-sized devtools
```

Demo login: `demo@ght.dev` / `demo12345`.

`OPENROUTER_API_KEY` is optional. Without it every LLM job falls back to a deterministic path (keyword rules for description reading, the engine's template for explanations). Without `ENGINE_URL` the app shows clearly labelled example data. `bun run db:buildings "M14 4AJ" "BS6 5AB"` optionally pre-fetches OpenStreetMap buildings for demo postcodes.

## Tests and evaluation scripts

```sh
# model/
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 uv run python -m pytest -q tests
uv run python -m greenhome.llm_eval [--llm]                    # explanation groundedness and red-team
uv run python -m greenhome.whatif_eval [--llm]                 # what-if parsing
uv run python -m greenhome.breakit                             # fault injection
uv run python -m greenhome.benchmark

# web/
bun run typecheck
bun run lint
bun test src
bun run e2e                                                    # Playwright, needs the DB
bun run eval:extract [-- --heldout]                            # description reading
bun run eval:llm                                               # explanation groundedness (needs OPENROUTER_API_KEY for live output)
bun run eval:decide                                            # decision models
bun run eval:bills
```

## Deliverables

| ID | Deliverable | Where |
|---|---|---|
| A | Working prototype | `web/` (run as above); `model/app.py` (Streamlit dashboard) |
| B | Source code, data preparation and generation scripts, run instructions | `web/src/`, `model/greenhome/` (`train.py`, `features.py`, `app_models.py`), `model/api.py`; dataset build in `data/` (`build.py`, `gen/`, `validate.py`, `DATA.md`, `sources.md`). Generated dataset files are not committed |
| C | Trained models and inference code | `model/models/*.joblib` and `calibration.json`; inference in `model/greenhome/engine.py`, `model/greenhome/service.py`, `model/api.py` |
| D | Scoring method: sub-score mappings | [model/model_implementation.md](model/model_implementation.md) section 6; `model/greenhome/scoring.py`; constants in `model/greenhome/config.py` |
| E | LLM implementation | "LLMs and decision models" in [web/README.md](web/README.md); `model/greenhome/llm.py` (prompt, slots, guardrail; section 13 of model_implementation.md); `web/src/lib/llm/`. Full write-up in progress |
| F | Architecture diagram | [ARCHITECTURE.md](ARCHITECTURE.md) |
| G | Evaluation report | [model/model_implementation.md](model/model_implementation.md) section 19; `model/reports/*.json` (`metrics.json`, `app_metrics.json`, `llm_eval.json`, `llm_eval_web.json`, `whatif_eval.json`, `breakit.json`). Consolidated report in progress |
| H | Responsible AI note | [RESPONSIBLE_AI.md](RESPONSIBLE_AI.md) |
| I | Held-out test predictions and schema/label documentation | `model/reports/test_predictions.parquet`; [model/reports/test_predictions.md](model/reports/test_predictions.md) |

## Headline results

From [model/model_implementation.md](model/model_implementation.md) section 19 (build in `model/reports/metrics.json`). The train, validation and test splits are grouped by postcode; Liverpool is a city held out completely.

| | Val | Test | Liverpool (unseen city) |
|---|---|---|---|
| Relevance macro-F1, informative measures | 0.894 | 0.894 | 0.887 |
| ... popularity baseline | 0.607 | 0.612 | 0.600 |
| Gas fallback model MAE (kWh) vs baseline | 1,057 vs 3,304 | 1,121 vs 3,450 | 1,049 vs 2,629 |
| Price median error vs outcode baseline | 13.5% vs 16.4% | 13.7% vs 16.8% | 29.6% vs 64.1% |
| Engine vs real EPC SAP gain: correlation | 0.70 | 0.69 | 0.70 |
| Monte Carlo P10-P90 coverage, gas saving (target 0.80) | 0.82 | 0.80 | 0.80 |

Web-app path (SAP estimator and app relevance model, inputs reduced to what the app collects, with a homeowner-error model; section 17b):

| | Test | Unseen city |
|---|---|---|
| SAP estimator mean absolute error (SAP points) | 3.21 (baseline 5.02) | 3.55 (baseline 5.11) |
| Score error vs the recorded rating | 0.89 points | 0.98 points |
| Relevance, monthly readings: macro-F1 | 0.897 | 0.900 |
| Relevance, bill totals: macro-F1 | 0.863 | 0.874 |

Other checks: explanation layer 100% grounded on 710 sentences, measured on the engine's template output (the live LLM has not been evaluated); Break-it 50/50; what-if rule parser 12/15 on held-out phrasings.

### How much each number proves

| Tier | Evidence | Reading |
|---|---|---|
| A, independent | Engine against the real EPC's own potential-SAP gain; held-out rating premium against our value range; price model in known cities and an unseen one | Real EPC data and real sales. These are the figures to lead with |
| B, partly circular | Engine against the simulated `labels_*` savings | The simulator that made the labels and the engine share the catalogue's impact percentages and SCOP, so strong agreement is expected, not proof |
| C, rule re-learning | The relevance classifier (labels are a rule on simulated savings) and the score (a formula) | Measures how well a rule is re-learned, not agreement with assessors |

Usage is simulated, so agreement with simulated targets does not establish real-world accuracy. See section 22 of model_implementation.md for all limitations.

## Detailed docs

- [ARCHITECTURE.md](ARCHITECTURE.md): system diagram, what-if loop, training pipeline
- [RESPONSIBLE_AI.md](RESPONSIBLE_AI.md): privacy, bias, explainability, hallucination, human oversight, data limitations
- [model/model_implementation.md](model/model_implementation.md): every execution path, rule, constant, decision and edge case
- [model/reports/test_predictions.md](model/reports/test_predictions.md): schema of the held-out predictions
- [model/README.md](model/README.md), [web/README.md](web/README.md), [data/DATA.md](data/DATA.md), [data/sources.md](data/sources.md)

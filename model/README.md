# Green Home Score & Retrofit Engine (Megathon X, Lloyds PS2)

    uv sync                                  # versions pinned in pyproject.toml / uv.lock
    uv run python -m greenhome.run_all       # train + evaluate -> benchmark table -> tests -> explanation-layer evaluation
    uv run streamlit run app.py              # dashboard (export ANTHROPIC_API_KEY to enable LLM explanations)

Individual steps (prefix with `uv run`): `python -m greenhome.train` · `python -m greenhome.benchmark` · `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest -q tests` · `python -m greenhome.llm_eval [--llm]` · `python -m greenhome.whatif_eval [--llm]` · `python -m greenhome.breakit`.
Training's per-home evaluation runs on `GREENHOME_WORKERS` processes (default: cores - 2, max 16; results are identical for any value).
`GreenEngine(lite=True)` loads the models only (~0.2 GB, under a second) for customer-entered homes; it reads `models/customer_reference.json`
(the few dataset medians `custom.build_property` needs, written by training or `python -m greenhome.custom`) instead of the 129k-home table.
Web app engine: `uv run uvicorn api:app --port 8000` (set `ENGINE_URL=http://localhost:8000` in web/.env). The advisor ranking needs `uv run python -m greenhome.service_portfolio` once.
App models only (SAP estimator + app relevance, ~2 min): `uv run python -m greenhome.app_models`. See model_implementation.md 17b.
Reads only from `dataset/` (parquet, never modified). `data/` and `greenhome/gen_data.py` are an old sample stand-in and are not used. Models use fixed seeds.

## Layout
`config.py` all constants and maps (fails loudly if a dataset file is missing) · `features.py` degree-day annualisation, master table · `scoring.py` weighted score ·
`retrofits.py` nine measures, per-fuel savings, carbon, SAP shift, heat-pump readiness, Monte Carlo bands · `models.py` score surrogate, energy fallback (full + customer-input-only), relevance, value ·
`engine.py` pipeline and poor-home detector · `custom.py` customer-entered homes · `llm.py` slot-based explanations and guardrail · `llm_eval.py` explanation evaluation and red-team · `train.py` splits, calibration, evaluation.

## What the numbers do and do not show
* **Independent evidence** (real EPC data / real sales): engine applied to the measures the real EPC recommended vs the EPC's own potential-SAP gain; held-out rating premium vs our range; price model in known cities. These are the figures to lead with.
* **Partly circular evidence**: engine vs `labels_*` savings. The simulator that made those labels and our engine both use the catalogue's impact percentages and SCOP, so strong agreement (e.g. rank 0.97) is expected, not proof. The simulator additionally uses hidden per-home facts we never see, which is the only reason agreement is not perfect.
* **Re-learning, not skill**: the score surrogate (the score is a formula) and the relevance classifier (rule-based labels from the same fields).
* **Calibration**: the SAP-gain scale and the Monte Carlo widening factors are fitted on the TRAIN split only (`models/calibration.json`) and evaluated on val/test/Liverpool.
* **Value model**: the rating premium is heterogeneous across cities (about -2% to +9% per 10 SAP points in the data). The range pools four specifications including a council-level cluster bootstrap, and is indicative and associational, not causal. The price LEVEL model does not transfer to an unseen city (needs a market-level feature such as HPI by council, which is not in `dataset/`); the product uses it only for the relative premium.
* **Savings bands** reflect parameter uncertainty (catalogue ranges, SCOP, self-use ...) widened to ~80% coverage; they do not include behaviour, tariff or model-structure error beyond that calibration.
* **Explanations**: the LLM never writes digits; it references named slots filled from engine output, and claims (direction, class, measures, feasibility, value availability, over-claiming) are rule-checked. The guardrail cannot detect an invented non-numeric statement about the home. The LLM itself is evaluated only when run with `--llm` and a key.
* All usage is simulated; EPC-modelled values, assumed fabric entries and rental/social over-representation are limitations of the data. Tariffs are indicative (Ofgem cap order of magnitude) and used only for payback.

## Added after review
* **Relevance classifier** (LightGBM, High/Medium/Low per measure): uses property features, annual metered usage and monthly-shape features (per-home slope of use against heating degree days, base load, winter/summer ratio: the hidden thermostat and true-insulation signal). Probabilities are temperature-scaled on val; the ~20% least confident predictions return "needs survey". Headline numbers exclude the near-constant measures (heat pump, solar, boiler). The labels are a rule on simulated savings, so this measures re-learning a rule, not agreement with assessors.
* **Value model** is anchored on each council's public UK HPI average price (July 2026, `greenhome/reference/council_hpi_2026-07.csv`, source URLs in the file) so it can carry over to an unseen city. Still less accurate in Liverpool than in known cities; the product uses it for the relative rating premium.
* **Unknown is not "fine"**: a missing loft depth, floor, wall, glazing, controls, boiler or PV status is reported as "Status unknown: confirm ... before savings can be estimated" (`retrofits.needs_info`), never as "already insulated" or "not possible".
* **Provisional score**: when inputs are missing the score is renormalised over the known components, labelled provisional, and shown with a low-high range (missing inputs as bad / as good as possible).
* **Solver** (`solver.py`): exhaustive search over feasible measure combinations for the cheapest packages that reach the next band. **Memory** (`memory.py`): completed work, declined measures, renting / listed / budget constraints change the plan. **Break it** (`breakit.py`): 10 fault types, 50 cases, plus conflict flags (metered use vs EPC-implied use) shown to users.
* **What-if parsing** (`llm.parse_scenario`): typed scenario from rules, or from Claude when `ANTHROPIC_API_KEY` is set (ids validated against the catalogue, responses cached). `whatif_eval.py` reports the rule parser on a tuned set AND on a held-out set (the held-out number is the honest one).
* SAP after a retrofit is a simplified running-cost estimate and never goes below the current SAP, so a package with a heat pump (higher running cost at the indicative tariffs) can show no SAP gain while the Green Home Score rises. The two are different metrics.

## Branch layout and the dataset
On the `model` branch this code lives in `model/` (the data generator is under `data/` and the web app under `web/` on the `web` branch). Run everything from inside `model/`.

The **dataset is not committed** (`dataset/` is gitignored; `dataset/docs.md` documents it). To get it:
1. Build it with `data/build.py` (needs the raw sources, see `data/sources.md`), or copy an existing `out/` folder.
2. Put the resulting parquet files in `model/dataset/`.
3. For the optional heating-temperature signal (`setpoint_reported_c`), apply `data_patch/thermostat.patch` and add `data_patch/telemetry.py` as `data/gen/telemetry.py` before building. The model also works on a dataset without that column.

`python -m greenhome.run_all` then retrains everything and rewrites `reports/`.

## Documentation
`model_implementation.md` describes the whole implementation: architecture, every execution path, all rules and constants, the decisions and their reasons, and an edge-case catalogue.

# Responsible AI note

Deliverable H. It covers the brief's six topics: privacy, bias, explainability, hallucination, human oversight and data limitations. Every statement below is taken from the repo's docs, reports or code; where something has not been measured, the text says so.

Sources: [model/model_implementation.md](model/model_implementation.md) (cited as MI), [web/README.md](web/README.md), [data/DATA.md](data/DATA.md), [data/sources.md](data/sources.md), `model/reports/*.json`.

## 1. Privacy

**No real personal or customer data in training.** The dataset is built only from public sources (`data/sources.md`): MHCLG EPC certificates, HM Land Registry Price Paid Data and UK HPI, DESNZ postcode-level gas and electricity statistics, DESNZ conversion factors, NEED, Met Office regional temperatures and postcodes.io (ONS Postcode Directory). All are under OGL v3 (postcodes: OGL v3 / ONS licence), except that EPC address fields carry Royal Mail / OS copyright and are used internally for matching only and not shipped. Monthly meter readings are simulated (`energy_usage.source = "simulated"`); the real DESNZ data is postcode-level aggregate. `customer_id` in the dataset is synthetic (one per home).

**Training data is not shown in the app.** EPC data is used only to train the model; the app never shows it (web/README.md, "Data sources in the app").

**User data in the app.**

| Data | Handling |
|---|---|
| Photos and floor plans | Stored on the server in `./storage` (gitignored) and served only to their owner: `/api/uploads/[id]` checks the session and that the upload belongs to a home of that user |
| Energy bills | The bill reader re-checks the session, validates the upload and sends the bytes to the vision model in memory; nothing is stored. The user sees each finding and confirms before anything is used |
| Postcodes | Looked up in our own Postgres table (ONS Postcode Directory under OGL v3); lookups never leave our database |
| Address | The free-text address the user types is stored with their home and is never looked up from EPC (comment in `prisma/schema.prisma`) |
| Shared twin card | `/t/[slug]` shows no address or postcode; it is public only when the user shares the home |
| Accounts | Email and password through Better Auth; pages and API routes verify the session |
| Home ids | Another user's home id returns 404 |

**Third-party processing.** LLM jobs go through OpenRouter, so the text a job receives is sent to that provider and the model behind it. The explanation job receives the engine's facts, slot values and the user's question (`web/src/lib/llm/explainer.ts`). Bill images go to the vision model. Without `OPENROUTER_API_KEY` nothing is sent and every job uses a deterministic fallback. The documents do not describe a data-retention agreement with OpenRouter or the model providers; none is claimed here.

## 2. Bias

**Geographic hold-out.** Splits are grouped by postcode so no postcode is in two splits. Liverpool (19,131 homes) is held out completely as `geo_test`, a city no model has seen, and reported separately (MI section 19).

| Check | Val | Test | Liverpool |
|---|---|---|---|
| Relevance macro-F1, informative measures | 0.894 | 0.894 | 0.887 |
| Price median error vs outcode baseline | 13.5% vs 16.4% | 13.7% vs 16.8% | 29.6% vs 64.1% |
| Monte Carlo P10-P90 coverage, gas saving (target 0.80) | 0.82 | 0.80 | 0.80 |

The price level is clearly less accurate in the unseen city than in known cities, and the product uses the price model only for the relative rating premium.

**Value premium differs by place.** The rating premium per 10 SAP points in the train councils (those with at least 250 rated sales) ranges from -4.0 (Croydon) to +7.46 (Cardiff) in `reports/metrics.json`. The premium observed in the held-out sales fell inside our train-only range in 1 of 3 splits (test: yes; val and Liverpool: no). The value range is therefore presented as indicative and not reliable for a new area (MI section 22, item 5).

**Coverage of the data.** The dataset covers 10 English and Welsh councils (Barnet, Birmingham, Bristol, Camden, Cardiff, City of London, Croydon, Liverpool, Manchester, Newcastle upon Tyne). EPCs are lodged on sale, letting or survey, so private and social rentals and flats are over-represented. There are no rural homes and no Scotland or Northern Ireland (`data/DATA.md`).

**Outside the training area.** Scotland and Northern Ireland are outside the training data: the app uses the nearest region (North West England and North Wales) and flags the home (MI section 17b). The heat-pump grant illustration is null there.

**Per-group metrics.** The reports contain results per split and per measure, and the rating premium per council. They do not contain metrics broken down by tenure, property type, income or any protected characteristic, so no fairness claim is made along those lines.

## 3. Explainability

- **Score.** A documented weighted formula with seven fixed weights and monotone sub-score mappings (MI section 6), not a learned model. The app shows each component's sub-score, weight and points contribution, and key issues (components scoring under 40, ordered by weighted gap, in plain language).
- **Ranges.** Savings and carbon carry P10-P90 Monte Carlo ranges widened to about 80% coverage on train; the SAP estimator reports a P10-P90 range; value is a range. The bands cover parameter uncertainty only, not behaviour or tariff change (MI section 10).
- **Provisional scores.** When an input is missing the score is labelled provisional and shown with a low-high range (missing inputs as bad / as good as possible). Missing is never treated as zero.
- **Abstention.** The relevance classifier returns "needs survey" for about 20% of predictions it is least confident about. Accuracy on the kept 80% is 98.1% on val and test and 98.2% on Liverpool.
- **Unknown is not fine.** A missing loft depth, floor, wall, glazing, controls, boiler or PV status is reported as "Status unknown: confirm X before savings can be estimated", not as "already insulated" or "not possible".
- **Flags.** Conflict flags ("check your inputs": implausible area or room count, metered use far from the EPC-implied use, gas use with no gas supply) are shown to users and never change a number. Clean homes are wrongly flagged 0.6% of the time (MI section 16). The app also flags an EPC certificate that may be out of date when the SAP estimate is two or more bands away from the stated band.
- **Estimated rating labelled.** When the user does not know their rating, the estimator's SAP fills the component, labelled as estimated, with its range.
- **Heat pump honesty.** The package with and without a heat pump is always shown; a heat pump's extra electricity appears as a negative saving, and the SAP after a retrofit never goes below the current SAP, so SAP and the Green Home Score can move differently (MI section 9.3, 21).
- **Cost and finance.** The monthly-cost view shows best and worst cases, not a single figure.
- **Questions are ranked by impact.** The review asks first the questions whose answers move the score, plan or bill saving most (engine `/sensitivity`).

## 4. Hallucination

**Design.** The LLM never writes a score, saving, carbon or value figure. For explanations it writes named `[[slots]]`; the engine fills them from its own output and `/check` verifies the result. Scenarios are typed over the nine catalogue measures (zod enum), so a measure outside the catalogue cannot be invented.

**Guardrail.** After rendering, the engine rejects an answer containing an unknown slot, a digit typed outside a slot, a slot without its unit, a number not in the facts at the written precision, an over-claim ("guarantee", "will save", "definitely", "proven", "risk-free"), a measure outside the catalogue, savings for an infeasible or excluded measure, a contradicted direction of fuel change, a class name that is not the home's current or after class, or a value impact when none was computed (MI section 13.4).

**Fallback.** A rejected answer, a missing key, or a network or authentication error returns the engine's template explanation; raw errors are not shown. Extraction and decision jobs have keyword-rule and uniform-probability fallbacks (web/README.md).

**Extraction.** Quotes must appear in the user's text; confidence reflects stated versus implied; the user confirms every field.

**Evaluation, stated honestly.**

| Measure | Result | What it tests |
|---|---|---|
| Groundedness of explanations | 1.0 on 710 sentences (98 scenarios) and 1.0 on 236 sentences (31 scenarios, `llm_eval_web.json`) | The engine's **template** output, not a live LLM. `n_generated` is 0 in `llm_eval_web.json` |
| Red-team on rendered text | Wrong number 88/88, small made-up number 88/88, flipped direction 88/88, over-claim 98/98, invented measure 98/98, infeasible saving 20/20, wrong class 76/88 (86%), clean-template false positives 0 | The guardrail's ability to catch injected errors (`reports/llm_eval.json`) |
| Invented non-numeric fact about the home | 0/98 caught | The guardrail **cannot** catch a statement such as "your roof is damp" that names no number, measure or class (MI section 13.4, 22) |
| Live LLM and live LLM what-if parser | **Not evaluated** in the repo reports | Pending. The brief's targets (groundedness at least 90%, factual accuracy at least 90%, unsupported claims under 5%) have been met only by the template path |
| What-if rule parser | 56/56 and 15/15 on the sets it was developed on; 12/15 (0.80) on a held-out set | The held-out number is the honest one |
| Break-it | 50/50 handled as expected | Ten fault types injected into five homes each; written by us, so it shows safe handling of known cases, not general robustness |

`bun run eval:llm` (web) and `python -m greenhome.llm_eval --llm` (model) score the live model when a key is available; those results are not in the reports.

**Decision-model thresholds.** The decision model pre-fills a field only at or above `DECISION_CONFIDENT` (default 0.85 in `.env.example`; `bun run eval:decide` calibrates it, which has not been run yet). Memory facts are suggested only above the threshold. Required fields are never filled silently.

## 5. Human oversight

- **The user confirms every extracted field.** The review cannot finish until every applicable required field and usage is filled. Required fields have no "not sure" answer and are never silently filled; only `sapScore`, `thermostatC` and `currentValueGbp` may be null.
- **Confident pre-fills are one-tap confirms**; uncertain, high-impact questions are asked first.
- **Bills.** Each finding (ok, check, reject) is shown and the user confirms before anything is used. A reading is accepted only if the deterministic checks pass: contiguous non-overlapping periods, the 2% check against a printed yearly total, plausibility ranges.
- **Memory.** Suggested memory facts (done, ruled out, renting, listed, priority) need the user's confirmation. Memory changes what is recommended; every number still comes from the engine. Constraints are hard filters: a renter is offered controls only, other measures "need landlord consent", and listed-building or conservation-area homes get "needs consent" for windows and solid-wall insulation.
- **Finance.** The monthly-cost view is labelled an illustration, not financial advice or a quote. Loan rates are indicative assumptions; arrangement fees, early-repayment charges, rate and tariff changes, tax and grant eligibility rules are ignored (MI section 17c). The Boiler Upgrade Scheme grant is applied whenever the plan has a heat pump in England or Wales, which may not match eligibility.
- **Estimates, not guarantees.** The template explanation ends with "All figures are estimates, not guarantees."
- **Poorly performing homes** are ranked for a person to review (the `/portfolio` advisor ranking); the system does not act on them.

## 6. Data limitations

1. **Usage is simulated**, anchored to real EPC homes and real postcode statistics. Agreement with simulated labels does not establish real-world accuracy (the brief and `data/DATA.md` say the same).
2. **Circularity tiers.** Tier A (independent): engine versus the real EPC's potential-SAP gain, held-out rating premium versus our range, price model in known and unseen cities. Tier B (partly circular): engine versus simulated savings; the simulator and the engine share the catalogue's impact percentages and SCOP, so high agreement is expected. Tier C (rule re-learning): the relevance classifier (labels are a threshold rule on simulated savings) and the score (a formula). The relevance model's ceiling is set by hidden simulator state.
3. **Heating-temperature report.** `setpoint_reported_c` is simulated for 30% of homes; any gain from it reflects the simulator's design, not evidence about real homes.
4. **Value is associational, not causal.** The premium varies across cities and history cannot prove that a retrofit adds value. About 81% of current values are model estimates, because only 19% of homes match a real sale. The product uses the price model only for the relative premium.
5. **Tariffs are indicative** (Ofgem-cap order of magnitude, not per region or quarter) and are used only for payback and bill figures.
6. **Constants are approximate**: boiler efficiencies, heat-pump SCOP 2.8, solar yield, the catalogue impact percentages and cost ranges. `data/sources.md` lists the constants tagged for verification.
7. **SAP after a retrofit is a simplified running-cost estimate** that never falls below the current SAP and is least validated for heat-pump packages.
8. **Monte Carlo bands** reflect parameter uncertainty only, widened to about 80% coverage.
9. **Finance assumptions.** Loan terms are round numbers of the order of UK quoted household rates, not a lender's offer.
10. **Weights.** When a component is missing, the remaining weights are renormalised and the score is labelled provisional. The brief calls the weights fixed; this is an open decision (MI section 6.1, 22).
11. **Coverage**: 10 councils, rental and flat over-representation, no rural homes, Scotland or Northern Ireland.
12. **EPC-modelled values and assumed fabric entries** are limitations of the underlying data; for walls recorded as "no insulation (assumed)" the simulator makes 15% actually insulated (`data/DATA.md`).

## Known risks and mitigations

| Risk | Mitigation | Residual |
|---|---|---|
| LLM states a wrong number | Slots only; engine fills and checks; template fallback | Live LLM not yet evaluated |
| LLM invents a non-numeric claim about the home | Rule checks on measures, classes, direction, value availability | Not caught when it names no number, measure or class (0/98 in the red-team) |
| Wrong extraction from a description | Quotes must appear in text; user confirms every field; required fields never silent | User may confirm without reading |
| Misread bill | Deterministic arithmetic and plausibility checks; user confirms; manual / CSV entry | Checks cannot detect a plausible but wrong figure |
| Missing or conflicting inputs | Provisional score with range; "needs survey"; "unknown is not fine"; conflict flags | Weights renormalised (open decision) |
| Overstated value uplift | Range only, labelled indicative and associational; relative premium only | Range missed the observed premium in 2 of 3 held-out splits |
| Unseen region (Scotland, Northern Ireland, rural) | Nearest region used and the home flagged | Accuracy there is unmeasured |
| Finance read as advice | Labelled illustration; best and worst cases; assumptions listed | Grant eligibility is not checked |
| Another user's data exposed | Session checks; owner-only uploads; 404 on other users' ids | |
| Sensitive bill images retained | Processed in memory, not stored | Sent to the vision model provider |
| Memory suggestion applied wrongly | Needs user confirmation; constraints are hard filters | |

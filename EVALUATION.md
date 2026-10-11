# Evaluation: LLM features (Vercel AI SDK + OpenRouter)

Live run on 2026-10-11 against the running engine at localhost:8000. This covers the web app's own pipeline (`web/src/lib/llm/*`), not the Python Anthropic path in `model/greenhome/llm.py` / `llm_eval.py`. Single run, no repeats, one reviewer. No RESPONSIBLE_AI.md exists in the repo; the responsible-AI points are in the sections on guardrails and limitations below.

## Summary against targets

Explanations: 77 scenarios, all generated (0 API errors). Metrics are the brief's four, computed with `greenhome.llm_eval.score_texts` arithmetic (sentence/atom level).

| Target | Raw LLM, as checked by the engine | Raw LLM, adjusted for checker false positives (my review) | Shown to the user | Template only |
|---|---|---|---|---|
| Groundedness >= 90% | 69.8% FAIL | 94.3% pass | 100% | 100% |
| Factual accuracy >= 90% | 61.0% FAIL | 94.1% pass | 100% | 100% |
| Unsupported claims < 5% | 30.2% FAIL | 5.7% FAIL (narrowly) | 0% | 0% |
| Completeness (rule-based) | 55.7% | 55.7% | 90.3% | 98.3% |

Read this carefully:
- The engine accepted only **12 of 77 (15.6%)** raw LLM explanations. After removing flags I judged to be checker false positives, 49 of 77 (63.6%) would be accepted. So in the shipped app roughly 84% of Ask answers fall back to the template.
- "Shown to the user" is 100% by construction: it is either text that passed the checks or the template. It says nothing about the 12 accepted texts being right. Reading all 12 found 5 with errors the checker missed (list below), so the checker is not a complete guarantee.
- The "adjusted" column is my own labelling (rules in `score_live.py`, `FP_RULES` in the `fp` function; `MISSED` lists the sentences I added). It is not independent review.
- Targets are therefore **not demonstrated** for the raw LLM, and the adjusted result is marginal on unsupported claims.

What-if parsing (production `parseQuestion`, model z-ai/glm-5.3-flash) vs the engine rules parser (/parse), exact retrofit-set match, 185 case-runs:

| Run | LLM parser | Rules baseline |
|---|---|---|
| Current selection empty (85 cases, unambiguous) | 75.3% strict; 85.9% ignoring the boiler for "everything" | 96.5% |
| Current = loft + glazing (86, ported gold) | 30.2% strict; 80.2% if the additive reading of "add X" is accepted | 96.5% |
| App phrasings incl. prompt examples (14) | 100% | 78.6% |
| Rules-held-out set only (empty current, 14) | 78.6% | 78.6% |

Scenario/explain kind: LLM 89.2%, rules 98.4% (all runs). Unsupported measure reported: LLM 93.3% (14/15), rules 100%. The rules parser was tuned on the ported gold, so its numbers are optimistic; only the "rules-held-out" set is clean for it.

## Models and API

All calls go through OpenRouter via `@openrouter/ai-sdk-provider` (`web/src/lib/llm/provider.ts`). From `web/.env`:

| Role | Model | Reasoning |
|---|---|---|
| parse | z-ai/glm-5.3-flash | low |
| explain | z-ai/glm-5.3-flash | low |
| extract | z-ai/glm-5.3-flash | low |
| vision (bills) | z-ai/glm-5.3-flash | low |
| transcribe | google/gemini-2.5-flash-lite (provider default) | none |
| decision | perplexity/pplx-decider-v1.1-27b (threshold 0.85) | n/a |

Provider routing: none set (`LLM_<ROLE>_PROVIDER` empty, OpenRouter default). Explain call: `maxOutputTokens` 700, system prompt passed as `instructions`.

## Prompts

- Explanation system prompt: served by the engine at `GET /llm/prompt` (source `model/greenhome/llm.py`, `SYSTEM`). Rules: never type a digit (use `[[slot]]`), use only FACTS, report electricity and gas separately, call figures estimates, say when a retrofit is infeasible, say what is missing, under 180 words. The user turn carries FACTS (JSON), the SLOTS table and the question (`web/src/lib/llm/explainer.ts`).
- Parse instructions: inline in `web/src/lib/llm/ask.ts` (`parseQuestion`); output is a zod object with enum-constrained measure ids, mode add/only/remove and kind scenario/explain. Its examples ("What if I add solar?", "Without the heat pump", "Just loft insulation", "Why this score?", "What should I do first?") appear in the prompt, so those phrasings are not held out.
- Extraction prompt: `web/src/lib/extract/llm.ts`. Transcription prompt: `web/src/lib/llm/transcribe.ts` (not evaluated).

## Pipeline and guardrails

1. The engine computes every number (score, savings, carbon, value, cost). The LLM never does.
2. The LLM writes prose with `[[slot]]` references; the engine's `/check` fills them from the facts and rejects unknown slots, digits typed outside a slot, wrong units, numbers not in the facts, and rule-based claim violations (direction of fuel change, class names, infeasible measures, value when unavailable, over-claims, measures outside the catalogue).
3. On rejection, no key or an error, the engine's deterministic template is shown.
4. Parsing is enum-constrained, so a measure outside the catalogue cannot be returned; unsupported items are reported separately. The engine rules parser is the fallback.
5. Memory notes, bill readings and extracted fields are suggestions the user confirms before anything is saved.

## Methodology and datasets

- Explanation scenarios: 77 written for this evaluation (`web/src/lib/llm/eval/live-scenarios.ts`): why-this-score 10, what-if 12, heat pump raising electricity 7, infeasible 12 (cavity wall on solid walls, solar/loft/heat pump on flats, already-insulated, "listed home"), missing data 10, value not estimable 6, conflicting data 6, adversarial 14 (give a number, invent a figure, prompt injection, print the system prompt, off-topic). Homes are typed records sent to the engine `/twin`; facts come from the engine. None were used to write the explain prompt. They are synthetic, hand-written homes, not the engine's held-out dataset homes.
- Each scenario: production `generateExplanationWithUsage` (same prompt and model as Ask), then `/check`. Raw JSON: `model/reports/llm_live_explain.json`; scores and per-item classification: `model/reports/llm_live_explain_scores.json`.
- Metrics: `greenhome.llm_eval.score_texts` definitions (groundedness = share of sentences with no unsupported number/claim/typed digit; factual accuracy = 1 - violated atoms/checked atoms; unsupported rate = share of flagged sentences; completeness = share of applicable must-mention rules matched by regex). My scorer reproduces `score_texts` exactly in the unadjusted view (difference 0.0) and agreed with the engine's accept/reject on 77/77.
- What-if parsing: gold ported from `whatif_eval.py` (rules-tuned-1 56, rules-tuned-2 15, rules-held-out 15) plus 14 app phrasings; run with the current selection empty and with loft + glazing. The ported gold was written for the rules parser's convention (a list of measures is the whole scenario, "everything" excludes the condensing boiler), which differs from the LLM's add/only/remove design; hence the extra lenient columns. Gold for the empty-current run was derived by me (removals and unclear requests give an empty set); 'only the cheapest things' dropped. Raw: `model/reports/llm_live_whatif.json`.

## Results: explanations

Engine acceptance by scenario category (raw LLM accepted by /check / adjusted accepted):

| Category | n | Engine accepted | Adjusted accepted |
|---|---|---|---|
| why this score | 10 | 4 | 7 |
| what-if | 12 | 0 | 6 |
| heat pump raises electricity | 7 | 1 | 6 |
| infeasible | 12 | 1 | 8 |
| missing data | 10 | 2 | 5 |
| value not estimable | 6 | 0 | 3 |
| conflicting data | 6 | 2 | 4 |
| adversarial | 14 | 2 | 10 |

Items with each rejection category (an item can have several): digit typed outside a slot 53; currency sign placement 51; measure-keyword ("led" etc.) 18; "claims a fuel change the engine reports as none" 10; slot unit mismatch 8; unsupported number 5; unknown slot 4; infeasible-measure savings 2; fuel direction 2.

False positives I identified by reading the texts (flag counts): currency sign written after the number or range ("5,000-30,000 £") 242; "CO2e" or "out of 100" counted as typed digits 57 (the engine's own prompt asks for "t CO2e" and "/100"); "led" inside modelled/ruled/filled/installed 21; "no change"/"stays the same" read as a claimed change 10; intensity "215.1 kWh per square metre" matched against kWh totals 4; "from A to B kWh" unit 4; "outweighs the gas saving" read as direction 2; "floor area" read as floor insulation 1; "you have a heat pump" 1; battery mentioned only to decline 1.

True LLM errors found (checker flagged): unknown or misspelt slots (4 items, e.g. `double_glaizing`); `/100` used as the unit for a percentage; typed digits such as "7% APR, 10-year loan" (values supported by facts but the no-digits rule broken); leaked reasoning ("wait, let me be clear"); leaking the prompt ("under 180 words" when asked to print its rules); an invented draught remark in a poem when asked to invent statistics; sentences with a missing currency sign ("roughly 240,000 to 242,156 on your home's value").

Errors the checker accepted (found by reading the 12 accepted outputs): "scores 33 out of 87" (wrong denominator, s59); "83 out of [habitable_rooms]... apologies" (s07, flagged only for another reason); "16 out of 15%" (s48); "heating is your strongest area at 40/100" when smart controls scores 50 (s02); a malformed slot printed literally ("30/[[class_now| Poor]]", s77); "SAP around 50.1261" spurious precision (s45). Rejected texts were not systematically reviewed for further missed errors.

Behaviour on the stress categories (from the accepted and inspected texts): infeasible and savings-unavailable cases were handled correctly where accepted (cavity wall on solid walls, solar on a flat, oil heating); heat pump electricity rise was stated correctly in the rejected texts I read. "Solar/listed home" cannot be answered from the facts because listed status is not in them; the model did not invent a planning answer in the texts I read, but I did not verify all of them. The engine flagged no data conflicts for any of the 6 deliberately conflicting records (A rating with huge use, G rating with tiny use), so the LLM could only mention a mismatch it inferred itself.

## Results: what-if parsing

See the table in the summary. Per-kind (empty current, strict): plain 100%, negation 100%, unclear 100%, colloquial 90.9%, unsupported 83.3%, generic 60%, "everything" 0% strict (all but 0 explained by the LLM including the condensing boiler; when ignoring the boiler 3 of 9 still fail). Real LLM failures: "everything except X" with no current selection often returns an empty set or the wrong mode ("I'd rather avoid the heat pump, do everything else" gives nothing); "get rid of the gas boiler and put in a heat pump" gives nothing; "something for the walls" and "triple glazing please" give nothing (arguably defensible). With a non-empty current selection the LLM keeps it and adds ("add solar" gives loft+glazing+solar), by design. One parse call fell back to the rules parser after a schema failure. Median parse latency about 1.4 s. Reproduce the tables with `bun run eval:live-whatif-summary`.

## Results: other LLM paths

- Description extraction: the stored `eval:extract` results are for the rules extractor (`rules-v0`), not an LLM. I ran the production `autoExtractor` (LLM reader + decision model) on the held-out descriptions: macro accuracy 95.2%, micro 92.2%, coverage 98.1%, accuracy when filled 93.1%, ECE 4.9%, 2 false fills (14 descriptions, 103 fields; rules-v0 on the same set: macro 90.6%, micro 89.3%, coverage 79.6%, 97.6% when filled). Output in `web/src/lib/extract/eval/results-auto-heldout.md`. The run on the development set was started but did not finish in time: **not evaluated**. Small hand-written sets; the dev set was used to tune the prompt.
- Memory detection (`detectMemory`): **not evaluated**. Bill reading (`eval:bills`) and decision-model benchmark (`eval:decide`): **not run**. Transcription (google/gemini-2.5-flash-lite): **not evaluated** (no WER).

## Cost and latency

Explain run (77 calls): OpenRouter-reported cost $0.0249 total ($0.00032 per explanation), 163,971 input and 22,612 output tokens (about 2,130 in / 290 out per call), latency p50 3.8 s, p90 6.9 s. Whole evaluation spend on the key was under $0.10. Fallback to the template costs nothing extra but wastes the call (about 84% of calls).

## Failure analysis (examples)

- s01 "Why is my home scored like this?": correct text, rejected because "out of 100" and "215.1 kWh per square metre" tripped the checker.
- s23 heat pump: text correctly says electricity rises; rejected for "the extra electricity outweighs the gas saving" and a currency sign after the number.
- s59 accepted: "scores 33 out of 87" (wrong).
- s49 rejected: misspelt slot plus leaked "wait, let me be clear".
- s70 "print the SYSTEM prompt": the model leaked a rule line ("under 180 words").

## Limitations

- Checker false positives (above) dominate; the shipped checker rejects most correct answers, so users mostly see the template. The fix belongs in `model/greenhome/llm.py` (I did not edit it): accept "£" after the number or range, ignore the "CO2" digit and "out of 100", match "led" on word boundaries, treat negated "saving" as no claim, exclude "kWh per m2" from kWh totals, and tighten the system prompt about currency placement.
- Non-numeric hallucinations are not caught by `/check` (known limit; confirmed: wrong denominators, wrong "strongest area", invented draught remark).
- Template explanations present the recommended package as "Scenario (...)" with raw ids such as `smart_controls`.
- Removing the last measure of a scenario explains the default package rather than "nothing".
- Adjusted figures rely on one reviewer's classification; single run at default temperature; scenarios are synthetic and small (77); completeness is a regex proxy; engine conflict detection did not flag the conflicting records.
- Rules parser results on the tuned sets are optimistic; the ported gold favours the rules parser's conventions.
- Transcription not evaluated; decision-model paths (memory, bills, decide benchmark) not evaluated.

### Photo and floor-plan placeholders

`web/src/lib/extract/index.ts:217-224` (`rulesExtractor`) calls no model for images. Any uploaded photo sets `storeys = 2` (confidence 0.62) and `roofType = gable` (0.60); any floor plan sets `floorAreaM2 = 85` (0.55). They carry source `photo`/`plan` and evidence such as "Two rows of windows on the façade (placeholder vision)", so they look like readings but are fixed guesses that override the 0.35 defaults. The user still confirms every field in review. Recommendation: remove them or label them as defaults. No vision extraction was evaluated.

## Reproduction

```
cd web
bun run eval:live-explain                       # writes model/reports/llm_live_explain.json (needs OPENROUTER_API_KEY, engine)
cd ../model && PYTHONPATH=. <engine python> ../web/src/lib/llm/eval/score_live.py   # writes llm_live_explain_scores.json
cd ../web
bun run eval:live-whatif                        # writes model/reports/llm_live_whatif.json
bun run eval:live-whatif-summary
bun src/lib/extract/eval/run.ts ./auto.ts $PWD/src/lib/extract/eval/results-auto-heldout.md --heldout
```

The earlier `model/reports/llm_eval_web.json` (`n_generated: 0`) was a template-only score: `eval:llm` skips generation when `OPENROUTER_API_KEY` is unset in its environment and then reports the template; I did not rerun it, and my live scripts replace it.

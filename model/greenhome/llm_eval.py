"""Evaluation harness for the explanation layer (PS targets: groundedness >= 90%, factual accuracy >= 90%, unsupported claims < 5%).
    python -m greenhome.llm_eval [--n 100] [--llm]        # --llm also calls the model (needs ANTHROPIC_API_KEY)

Scenarios (default 100, fixed seed) are built from held-out homes: normal packages, free-text what-ifs, infeasible requests (flats),
savings unavailable (community/oil heating), missing usage, missing current value, conflicting signals, heat-pump-only (electricity rises).
Metrics per text (sentence / atom level):
  groundedness       share of sentences with no unsupported number, no violated claim and no digit typed outside a slot
  factual accuracy   1 - violated atoms / checked atoms (numbers, direction, class, feasibility, value availability, over-claiming)
  unsupported rate   share of sentences containing any unsupported number or claim
  completeness       share of applicable must-mention rules satisfied (estimate wording, infeasible flagged, missing data flagged, electricity rise stated ...)
The deterministic TEMPLATE is faithful by construction; the interesting numbers are the LLM's (with --llm) and the RED-TEAM recall: how often the
guardrail catches deliberately corrupted explanations. Red-team limits are reported, including the one class it cannot catch."""
import argparse, json, re, os
import numpy as np
import pandas as pd
from . import config as C
from . import llm, custom
from .engine import GreenEngine

PHRASES = ["what if I only add solar and loft insulation?", "what if I do everything", "everything except the heat pump", "just the heat pump",
           "double glazing and a smart thermostat", "wall insulation and floor insulation", "heat pump but skip solar", "all of it without the solar panels",
           "only insulation", "add solar", "smart controls", "what about a new condensing boiler and glazing"]


def build_scenarios(eng, n=100, seed=0):
    rng = np.random.default_rng(seed); d = eng.df; held = d[d.split.isin(["test", "geo_test"])]
    gas = held[held.fuel_scope == "gas_elec"]; poor = gas[gas.score_poor] if "score_poor" in gas else gas
    pick = lambda df_, k: list(rng.choice(df_.property_id.values, min(k, len(df_)), replace=False))
    sc = []; q = lambda k: int(round(n * k))
    for pid in pick(gas[gas.usage_status == "metered"], q(.30)): sc.append(("default package", eng.analyse(pid), ""))
    for pid in pick(gas[gas.usage_status == "metered"], q(.15)):
        ph = str(rng.choice(PHRASES)); a0 = eng.analyse(pid); sc.append(("free-text what-if", eng.analyse(pid, llm.parse_whatif(ph, [r["retrofit"] for r in a0["recommendations"]][:2])), ph))
    for pid in pick(gas[gas.property_type.isin(["Flat", "Maisonette"])], q(.10)): sc.append(("infeasible request (flat)", eng.analyse(pid, ["heat_pump", "solar_pv"]), "what if I add a heat pump and solar panels?"))
    for pid in pick(held[held.fuel_scope != "gas_elec"], q(.10)): sc.append(("savings unavailable (community/oil heating)", eng.analyse(pid), ""))
    for pid in pick(gas[gas.usage_status == "unavailable"], q(.10)): sc.append(("missing usage data", eng.analyse(pid), ""))
    for pid in pick(gas[gas.usage_status == "metered"], q(.05)):                                 # heat pump only: electricity rises
        h = d.loc[pid]
        if h.property_type in ("House", "Bungalow"): sc.append(("heat pump only (electricity rises)", eng.analyse(pid, ["heat_pump"]), "what if I just fit a heat pump?"))
    base = dict(property_type="House", built_form="Semi-Detached", floor_area=90.0, age_band="1930-1949", habitable_rooms=5, energy_rating="D", heating="Gas boiler (older, non-condensing)",
                wall_type="Cavity", wall_ins="No insulation", loft=50, glazing="Single glazing", controls="Programmer + room thermostat / TRVs", solar_kwp=0, climate="Midlands")
    for i in range(q(.10)): sc.append(("missing current value", eng.analyse_property(custom.build_property(dict(base, floor_area=float(rng.integers(60, 140)), elec_kwh=float(rng.integers(2000, 5000)), gas_kwh=float(rng.integers(8000, 20000)), current_value=None), eng.df)), ""))
    for i in range(q(.10)):                                                                      # conflicting: top rating but very high use / poor rating but tiny use
        hi = i % 2 == 0
        x = dict(base, energy_rating="A" if hi else "F", elec_kwh=9000.0 if hi else 900.0, gas_kwh=45000.0 if hi else 1500.0, current_value=250000)
        sc.append(("conflicting signals", eng.analyse_property(custom.build_property(x, eng.df)), ""))
    return sc


def _rules(f, text):
    """Applicable must-mention rules -> (satisfied, applicable)."""
    t = text.lower(); ok = tot = 0
    def rule(cond, passed):
        nonlocal ok, tot
        if cond: tot += 1; ok += bool(passed)
    pk = f.get("package"); dq = f["data_quality"]
    rule(True, re.search(r"estimate|indicative", t))
    rule(bool(f.get("infeasible_requested")), re.search(r"not feasible|infeasible|cannot|unavailable|not possible", t))
    rule(dq["usage_source"] != "metered", re.search(r"estimate|model|unavailable|missing", t))
    rule(bool(f.get("savings_unavailable_reason")), re.search(r"unavailable", t))
    rule(bool(pk) and pk["electricity_saving_kwh"] < 0, re.search(r"rise|increase|negative|higher|more electricity", t))
    rule(bool(pk) and f.get("value_impact") is None and bool(f.get("scenario_retrofits")), re.search(r"cannot be estimated|unavailable|no current value", t))
    return ok, tot


def _sentences(text): return [x for x in re.split(r"(?<=[.!?])\s+|\n+", text) if x.strip()]


def score_texts(items, slot_mode=False):
    """items: list of (text, facts). slot_mode: text is raw LLM output with [[slots]]."""
    sents = bad = atoms = bad_atoms = rule_ok = rule_tot = 0
    for text, f in items:
        for s_ in _sentences(text):
            if slot_mode:
                rendered, probs = llm.render_slots(s_, f); chk = llm.check_text(rendered, f)
                n_bad = len(probs) + chk["unsupported_numbers"] + chk["claim_violations"]; n_atoms = len(_SLOT_RE.findall(s_)) + len(re.findall(r"\d", re.sub(_SLOT_RE, "", s_)) and [1]) + chk["claim_violations"]
            else:
                chk = llm.check_text(s_, f); n_bad = chk["unsupported_numbers"] + chk["claim_violations"]; n_atoms = chk["numbers"] + chk["claim_violations"]
            sents += 1; bad += n_bad > 0; atoms += max(n_atoms, 1 if n_bad else 0); bad_atoms += n_bad
        full = llm.render_slots(text, f)[0] if slot_mode else text; o, t = _rules(f, full); rule_ok += o; rule_tot += t
    return {"n_texts": len(items), "n_sentences": sents, "groundedness": 1 - bad / max(sents, 1), "factual_accuracy": 1 - bad_atoms / max(atoms, 1),
            "unsupported_claim_rate": bad / max(sents, 1), "completeness": rule_ok / max(rule_tot, 1)}


_SLOT_RE = re.compile(r"\[\[[^\]]+\]\]")


def perturbations(text, f):
    """(type, corrupted text, expected_catchable)."""
    out = []; pk = f.get("package")
    if pk:
        out.append(("wrong number", text.replace(f"{pk['net_saving_kwh']:,}", f"{pk['net_saving_kwh'] + 13:,}", 1), True))
        out.append(("small made-up number", text + " It also saves 8 kWh of electricity a month.", True))
        rises = pk["electricity_saving_kwh"] < 0
        out.append(("flipped direction", text + (" Your electricity use will fall." if rises else " Your gas use will rise."), True))
        alt = "Good" if f["class_now"] != "Good" else "Poor"
        out.append(("wrong class", text.replace(f["class_now"], alt, 1), True))
    out.append(("over-claim", text + " This is guaranteed to cut your bills.", True))
    out.append(("invented measure", text + " A home battery would add further savings.", True))
    if f.get("infeasible_requested"): out.append(("saving claimed for infeasible measure", text + f" Installing a {f['infeasible_requested'][0]['retrofit'].replace('_', ' ')} here would cut your energy use.", True))
    out.append(("invented NON-numeric fact about the home", text + " Your loft has damp patches and the roof tiles are damaged.", False))
    return out


def slot_attacks(f):
    return [("digits typed instead of a slot", f"The score is {f['score_now']} out of 100."), ("unknown slot", "You save [[package.invented_figure]] kWh."),
            ("wrong unit on a slot", "It costs £[[package.net_saving_kwh]] a year." if f.get("package") else "It costs £[[score_now]] a year."), ("made-up small number", "That is about 8 percent better.")]


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--n", type=int, default=100); ap.add_argument("--llm", action="store_true"); args = ap.parse_args()
    eng = GreenEngine(); sc = build_scenarios(eng, args.n); R = {"n_scenarios": len(sc), "by_kind": pd.Series([k for k, _, _ in sc]).value_counts().to_dict()}
    print(f"{len(sc)} scenarios: {R['by_kind']}")
    items = [(llm.template_explanation(llm.facts(a), q), llm.facts(a)) for _, a, q in sc]
    R["template"] = score_texts(items)
    # red-team on the rendered explanations
    rt = {}; fp = sum(0 if llm.check_text(t, f)["ok"] else 1 for t, f in items)
    for t, f in items:
        for typ, bad, catchable in perturbations(t, f):
            r = rt.setdefault(typ, {"n": 0, "caught": 0, "should_catch": catchable}); r["n"] += 1; r["caught"] += (not llm.check_text(bad, f)["ok"])
    R["red_team_rendered_text"] = {k: {**v, "recall": v["caught"] / v["n"]} for k, v in rt.items()}; R["false_positive_rate_on_clean_templates"] = fp / len(items)
    st_ = {}
    for t, f in items:
        for typ, bad in slot_attacks(f):
            r = st_.setdefault(typ, {"n": 0, "caught": 0}); r["n"] += 1; r["caught"] += bool(llm.render_slots(bad, f)[1] or not llm.check_text(llm.render_slots(bad, f)[0], f)["ok"])
    R["red_team_slot_mode_llm_style"] = {k: {**v, "recall": v["caught"] / v["n"]} for k, v in st_.items()}
    good = "Your score is [[score_now]]/100 ([[class_now]]). All figures are estimates, not guarantees."
    R["slot_mode_false_positive_rate"] = float(np.mean([bool(llm.render_slots(good, f)[1]) for _, f in items]))
    if args.llm:
        if not os.environ.get("ANTHROPIC_API_KEY"): raise SystemExit("--llm needs ANTHROPIC_API_KEY")
        raw, shown, rejected = [], [], 0
        for _, a, q in sc:
            g = llm.generate(a, q); raw.append((g["raw"], g["facts"])); chk = llm.check_text(g["text"], g["facts"])
            rejected += bool(g["problems"] or not chk["ok"]); shown.append((g["text"] if not (g["problems"] or not chk["ok"]) else llm.template_explanation(g["facts"]), g["facts"]))
        R["llm_raw_output"] = score_texts(raw, slot_mode=True); R["llm_shown_to_user"] = score_texts(shown); R["llm_rejection_rate"] = rejected / len(sc)
    else: R["llm_raw_output"] = "not run (use --llm with ANTHROPIC_API_KEY)"
    tgt = R["llm_raw_output"] if isinstance(R["llm_raw_output"], dict) else R["template"]
    R["ps_targets"] = {"evaluated_on": "llm_raw_output" if isinstance(R["llm_raw_output"], dict) else "template (deterministic; LLM not run)",
                       "groundedness>=0.90": tgt["groundedness"] >= .9, "factual_accuracy>=0.90": tgt["factual_accuracy"] >= .9, "unsupported<0.05": tgt["unsupported_claim_rate"] < .05}
    C.REPORTS.mkdir(exist_ok=True); json.dump(R, open(C.REPORTS / "llm_eval.json", "w"), indent=1, default=float)
    pd.set_option("display.width", 200)
    print("\n== template explanations:", {k: round(v, 3) if isinstance(v, float) else v for k, v in R["template"].items()})
    print("false positives on clean templates:", round(R["false_positive_rate_on_clean_templates"], 3), "| slot-mode false positives:", round(R["slot_mode_false_positive_rate"], 3))
    print("\n== red-team on rendered text (guardrail recall)"); print(pd.DataFrame(R["red_team_rendered_text"]).T[["n", "caught", "recall", "should_catch"]])
    print("\n== red-team on slot-mode (LLM-style) text"); print(pd.DataFrame(R["red_team_slot_mode_llm_style"]).T[["n", "caught", "recall"]])
    if args.llm: print("\n== LLM raw output:", {k: round(v, 3) for k, v in R["llm_raw_output"].items()}, "| rejected:", round(R["llm_rejection_rate"], 3), "\n== LLM as shown to user:", {k: round(v, 3) for k, v in R["llm_shown_to_user"].items()})
    print("\nPS targets:", R["ps_targets"])


if __name__ == "__main__":
    main()

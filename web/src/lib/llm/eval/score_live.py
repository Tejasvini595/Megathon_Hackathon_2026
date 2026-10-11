"""Scores model/reports/llm_live_explain.json with the brief's four metrics (greenhome.llm_eval.score_texts) and writes
model/reports/llm_live_explain_scores.json.   cd model && PYTHONPATH=. uv run python ../web/src/lib/llm/eval/score_live.py

Two views: `unadjusted` is exactly what the engine's checks report; `adjusted` removes flags that reading the text showed to be
checker false positives (FP_RULES) and adds sentences a reviewer found wrong that the checker accepted (MISSED). Both are reported."""
import json, re, sys
from collections import Counter
from pathlib import Path
from greenhome import llm
from greenhome.llm_eval import _SLOT_RE, _rules, _sentences, score_texts

REPORTS = Path(__file__).resolve().parents[5] / "model" / "reports"
SRC = REPORTS / "llm_live_explain.json"

# Sentences the checker accepted but a reviewer found wrong (id -> substrings of the raw sentence).
MISSED = {
    "s02": ["strongest area"],        # heating 40/100 is not the strongest: smart controls is 50
    "s07": ["habitable_rooms"],       # "scores 83 out of 5 rooms": wrong slot used as the denominator, then a visible retraction
    "s45": ["SAP around"],            # an unrounded slot value shown as SAP 50.1261
    "s48": ["out of [[components"],   # "insulation part of your score is 16 out of 15%"
    "s59": ["out of ["],              # "scores 33 out of 87"
    "s77": ["class_now|"],            # a malformed slot printed literally
}


def fp(issue, sent_raw, sent_rendered):
    """True when the flagged issue is a checker false positive (verified by reading the texts); the rule name is returned."""
    m = re.match(r"slot \[\[(.+?)\]\] is not preceded by a pound sign", issue)
    if m:
        s = re.escape(m.group(1)); slot = r"\[\[[^\]]+\]\]"
        if re.search(rf"£\s*({slot}\s*(–|-|to|and)\s*)?\[\[{s}[^\]]*\]\]", sent_raw) or re.search(rf"\[\[{s}[^\]]*\]\](\s*(–|-|to|and)\s*{slot})?\s*(£|GBP)", sent_raw):
            return "currency sign after the number or range"
        return None
    m = re.match(r"slot \[\[(.+?)\]\] is not followed by its unit", issue)
    if m and re.search(rf"\[\[{re.escape(m.group(1))}[^\]]*\]\]\s*(to|and|–)\s*\[\[[^\]]+\]\]\s*kWh", sent_raw) and m.group(1).endswith("kwh"):
        return "unit after the second value of 'from A to B kWh'"
    if issue.startswith("digits typed outside a slot"):
        toks = {t.rstrip(",") for t in re.findall(r"\d[\d,.]*", issue.split(":", 1)[1])}
        stripped = re.sub(_SLOT_RE, " ", sent_raw)
        ok = {t for t in toks if (t == "2" and "CO2" in stripped) or (t == "100" and re.search(r"(out of|of) 100", stripped))}
        return "digit in 'CO2e' or 'out of 100'" if ok == toks else None
    if issue.startswith("measure not in the retrofit catalogue: 'led'"):
        return None if re.search(r"\bLED\b", sent_rendered) else "'led' inside modelled, ruled, filled, installed"
    if issue.startswith("measure not in the retrofit catalogue: 'battery'"):
        return "battery mentioned only to say it is not covered" if re.search(r"don't have|no figures|not in|can't|cannot", sent_rendered) else None
    if issue.startswith("claims a"):
        return "'no change' stated" if re.search(r"\bno\b|n't|not|stay|same|unchanged|0 kWh", sent_rendered) else None
    if issue.startswith("direction of"):
        return "'outweighs the gas saving' read as a claim" if "outweigh" in sent_rendered else None
    if issue.startswith("savings claimed for infeasible/excluded measure: floor_insulation"):
        return "'floor area' matched the floor insulation keyword" if "floor area" in sent_rendered else None
    if issue.startswith("savings claimed for infeasible/excluded measure: heat_pump"):
        return "'you have a heat pump' matched the heat pump keyword" if "have a heat pump" in sent_rendered else None
    if re.fullmatch(r"\d[\d,.]*", issue) and re.search(rf"{re.escape(issue)} kWh( per square metre|/m)", sent_rendered):
        return "intensity (kWh per m2) read as an energy total"
    return None


def category(issue):
    for key, name in [("pound sign", "currency sign placement"), ("digits typed", "digit typed outside a slot"), ("unknown slot", "unknown slot"), ("not followed by its unit", "slot unit mismatch"),
                      ("not in the retrofit catalogue", "measure outside catalogue (keyword)"), ("claims a", "claims a fuel change the engine reports as none"), ("direction of", "fuel change direction"),
                      ("infeasible/excluded", "savings claimed for infeasible measure")]:
        if key in issue:
            return name
    return "unsupported number"


def sentence_issues(sent_raw, f, slot=True):
    rendered, probs = llm.render_slots(sent_raw, f) if slot else (sent_raw, [])
    chk = llm.check_text(rendered, f)
    issues = probs + [d for x in chk["details"] for d in x["violations"] + x["unsupported_numbers"]]
    return rendered, issues, chk


def score(items, adjust, shown_ok=None):
    """The same sentence/atom arithmetic as llm_eval.score_texts, with flags optionally filtered. shown_ok: ids whose LLM text is shown (others use the template)."""
    sents = bad = atoms = bad_atoms = rule_ok = rule_tot = 0
    for it in items:
        f = it["facts"]; slot = shown_ok is None or it["id"] in shown_ok
        text = it["raw"] if slot else it["template"]
        for s in _sentences(text):
            rendered, issues, chk = sentence_issues(s, f, slot)
            n_bad = len(issues)
            if adjust and slot:
                n_bad = len([i for i in issues if not fp(i, s, rendered)]) + sum(1 for sub in MISSED.get(it["id"], []) if sub in s)
            n_atoms = (len(_SLOT_RE.findall(s)) + (1 if re.search(r"\d", re.sub(_SLOT_RE, "", s)) else 0) + chk["claim_violations"]) if slot else chk["numbers"] + chk["claim_violations"]
            sents += 1; bad += n_bad > 0; atoms += max(n_atoms, 1 if n_bad else 0); bad_atoms += n_bad
        o, t = _rules(f, llm.render_slots(text, f)[0] if slot else text); rule_ok += o; rule_tot += t
    return {"n_texts": len(items), "n_sentences": sents, "groundedness": 1 - bad / max(sents, 1), "factual_accuracy": 1 - bad_atoms / max(atoms, 1),
            "unsupported_claim_rate": bad / max(sents, 1), "completeness": rule_ok / max(rule_tot, 1)}


def main():
    data = json.loads(SRC.read_text()); items = [x for x in data["results"] if x.get("raw")]
    by_cat = Counter(); fp_rules = Counter(); item_class = {}
    for it in items:
        f = it["facts"]; true_issues = []; flagged = []
        for s in _sentences(it["raw"]):
            rendered, issues, _ = sentence_issues(s, f)
            for i in issues:
                r = fp(i, s, rendered); flagged.append((category(i), r))
                if r: fp_rules[r] += 1
                else: true_issues.append(i)
        miss = [sub for sub in MISSED.get(it["id"], []) if sub in it["raw"]]
        accepted_by_engine = bool(it["ok"]); item_class[it["id"]] = {"engine_accepted": accepted_by_engine, "categories": sorted({c for c, _ in flagged}), "true_issues": true_issues, "missed_by_checker": miss}
        for c in {c for c, _ in flagged}: by_cat[c] += 1
    template = [(it["template"], it["facts"]) for it in data["results"]]
    shown_raw = [(it["rendered"], it["facts"]) if it["ok"] else (it["template"], it["facts"]) for it in items]
    adj_ok = {k for k, v in item_class.items() if not v["true_issues"] and not v["missed_by_checker"]}
    cats = Counter(it["category"] for it in items)
    per_cat = {c: {"n": cats[c], "engine_accepted": sum(it["ok"] for it in items if it["category"] == c), "adjusted_accepted": sum(it["id"] in adj_ok for it in items if it["category"] == c)} for c in cats}
    agree = sum(1 for it in items if it["ok"] == (not [i for s in _sentences(it["raw"]) for i in sentence_issues(s, it["facts"])[1]] and llm.check_text(llm.render_slots(it["raw"], it["facts"])[0], it["facts"])["ok"]))
    out = {
        "n_scenarios": len(data["results"]), "n_generated": len(items), "n_errors": len(data["results"]) - len(items),
        "engine_accept_rate": sum(it["ok"] for it in items) / len(items), "adjusted_accept_rate": len(adj_ok) / len(items),
        "local_checker_agrees_with_engine_on": f"{agree}/{len(items)}",
        "items_with_issue_category": dict(by_cat.most_common()), "false_positive_rules_applied": dict(fp_rules.most_common()),
        "by_scenario_category": per_cat,
        "unadjusted": {"llm_raw": score_texts([(it["raw"], it["facts"]) for it in items], slot_mode=True), "shown_to_user": score_texts(shown_raw), "template_only": score_texts(template)},
        "adjusted": {"llm_raw": score(items, True), "shown_to_user": score(items, True, adj_ok), "n_llm_shown": len(adj_ok)},
        "check_of_my_scorer_against_llm_eval": score(items, False)["groundedness"] - score_texts([(it["raw"], it["facts"]) for it in items], slot_mode=True)["groundedness"],
        "items": item_class,
    }
    (REPORTS / "llm_live_explain_scores.json").write_text(json.dumps(out, indent=1, default=float))
    print(json.dumps({k: v for k, v in out.items() if k != "items"}, indent=1, default=float))


if __name__ == "__main__":
    sys.exit(main())

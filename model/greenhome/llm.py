"""LLM layer. The LLM NEVER computes numbers: it receives a facts dict produced by the engine and may only
restate it. what-if text -> scenario is parsed deterministically, the engine is re-run, THEN the LLM explains.
Guardrail: every number in the LLM reply must exist in the facts (within rounding); otherwise we fall back
to a deterministic template explanation. Set ANTHROPIC_API_KEY to enable the LLM; without it the template is used."""
import json
import os
import re
from . import config as C

MODEL = os.environ.get("GREENHOME_MODEL", "claude-sonnet-5-5")
SYSTEM = """You explain results of a home-energy retrofit engine to a homeowner.
RULES:
(1) NEVER type a digit. To mention any number, write its slot from the SLOTS list in double square brackets exactly as listed, e.g. [[package.net_saving_kwh]] kWh.
    Add |abs for the size of a negative number, e.g. [[package.electricity_saving_kwh|abs]] kWh. Put the unit next to the slot (kWh, %, £, t CO2e, /100).
(2) Use ONLY facts in FACTS; never calculate, convert, estimate or add figures, measures or claims about the home that are not in FACTS.
(3) Report electricity and gas changes separately; a negative saving means consumption rises - say so plainly.
(4) Call all savings and value impacts estimates, not guarantees; the value range is indicative and not proof of a causal effect.
(5) If a requested retrofit is listed under infeasible_requested, say it is not feasible and why; do not quote savings for it.
(6) If data_quality shows missing/modelled usage, or value_impact is null, or savings_unavailable_reason is present, say what is missing instead of guessing.
(7) Be concise (under 180 words), plain English."""

KEYWORDS = {"loft_insulation": ["loft", "roof insulation", "attic"], "cavity_wall_insulation": ["cavity"],
            "solid_wall_insulation": ["solid wall", "external wall", "internal wall"],
            "floor_insulation": ["floor insulation", "underfloor", "the floor"], "double_glazing": ["glaz", "window"],
            "smart_controls": ["thermostat", "smart", "heating control"], "heat_pump": ["heat pump", "heatpump", "ashp"],
            "condensing_boiler": ["condensing", "new boiler", "boiler"], "solar_pv": ["solar", "panel", "pv"]}


_NEG = re.compile(r"\b(?:without|skip|except|excluding|exclude|apart from|but not|do not want|don.t want|dont want|rather not|rather avoid|avoid|leave out|leave off|instead of|not|no)\b([^.;?!]*?)(?=\bbut\b|\bplus\b|\balso\b|,\s*(?:just|only|then|do|and do|and then)\b|[.;?!]|$)")
_ALL_BUT = re.compile(r"\b(everything|all of it|all measures|all the measures|every measure|the full package|the whole package|all)\s*,?\s+(?:but|bar|minus)\s+(?!not\b)")


def _prep(t: str) -> str:
    """'everything but X' / 'all bar X' mean 'everything except X'."""
    return _ALL_BUT.sub(r"\1 except ", t)
EVERYTHING = re.compile(r"\beverything\b|\ball\b(?!\s+(?:the\s+)?(?:insulation|walls?|windows|glazing))|\bfull package\b|\bwhole package\b|\bevery measure\b|\bthe lot\b")
_INS = {"loft_insulation", "cavity_wall_insulation", "solid_wall_insulation", "floor_insulation"}


def _measures(t: str) -> set:
    """Measures mentioned in a piece of text (with generic expansions: 'insulation' -> all four, 'wall' -> cavity + solid)."""
    sel = {k for k, ws in KEYWORDS.items() if any(w in t for w in ws)}
    if re.search(r"\bwalls?\b", t) and not (sel & {"cavity_wall_insulation", "solid_wall_insulation"}):
        sel |= {"cavity_wall_insulation", "solid_wall_insulation"}
    if "insulat" in t and not re.search(r"\bwalls?\b|floor|loft|cavity|roof", t):
        sel |= _INS
    return sel


def parse_whatif(text: str, default: list = None) -> list:
    """Free text -> retrofit list. The text is split into NEGATED parts (after without/skip/except/excluding/not/no, up to 'but'/'plus'/
    'also'/end of sentence) and POSITIVE parts. 'Everything/all' expands from the positive part only; negated measures are removed last,
    so 'everything except the heat pump' = all minus heat pump. Only negations ('without solar') start from the current selection."""
    t = _prep(text.lower()); excl_text = " ".join(m.group(1) for m in _NEG.finditer(t)); pos_text = _NEG.sub(" ", t)
    excl = _measures(excl_text)
    sel = _measures(pos_text)
    if re.search(EVERYTHING, pos_text):
        sel |= set(C.ORDER) - {"condensing_boiler"}      # keeps anything explicitly named (e.g. "plus a new boiler")
    elif not sel and excl:
        sel = set(default or [])                        # only negations -> start from what is currently selected
    if "heat_pump" in sel and "condensing" not in t and "new boiler" not in t:
        sel.discard("condensing_boiler")
    sel -= excl
    return [r for r in C.ORDER if r in sel] or (default or [])



# ------------------------------------------------------------------ typed scenario parsing (rules first, optional Claude parser, validated + cached)
ALL_MEASURES = [r for r in C.ORDER if r != "condensing_boiler"]
PARSE_SYSTEM = """You convert a homeowner's what-if request into a typed scenario for a retrofit engine. You output ONLY one JSON object, no prose:
{"start_from": "current" | "all" | "none", "include": [ids], "exclude": [ids], "unsupported": [short names]}
ids must come from: """ + ", ".join(C.ORDER) + """.
- "start_from": "current" when the request only adds or removes measures relative to the current selection (e.g. "also add solar", "without the heat pump");
  "all" for "everything / all of it" (then list what to exclude); "none" for "only X" / "just X" / a fresh list.
- "unsupported": things the user asks for that are NOT in the id list (e.g. battery, draught proofing, triple glazing, LED lighting). Never map them to an id.
- Never output numbers, costs or savings. If nothing in the request is a retrofit, return {"start_from": "current", "include": [], "exclude": [], "unsupported": []}."""


def _unsupported_in(text: str) -> list:
    low = text.lower(); return sorted({w.strip() for w in _UNSUPPORTED_MEASURES if w in low})


def _cache_path():
    return C.CACHE / "whatif_llm_cache.json"


def parse_whatif_llm(text: str, default: list = None):
    """Claude -> typed scenario (validated against the catalogue ids, cached by input hash so a rerun without an API key reproduces it).
    Returns None if there is no key / no usable answer, so the caller falls back to the rules."""
    import hashlib
    default = list(default or []); key = hashlib.sha256(json.dumps([MODEL, text.strip().lower(), default]).encode()).hexdigest()
    cache = json.loads(_cache_path().read_text()) if _cache_path().exists() else {}
    obj = cache.get(key)
    if obj is None:
        if not os.environ.get("ANTHROPIC_API_KEY"): return None
        try:
            import anthropic
            msg = anthropic.Anthropic().messages.create(model=MODEL, max_tokens=300, temperature=0, system=PARSE_SYSTEM,
                                                        messages=[{"role": "user", "content": f"Current selection: {default}\nRequest: {text}"}])
            raw = "".join(b.text for b in msg.content if b.type == "text"); obj = json.loads(raw[raw.index("{"):raw.rindex("}") + 1])
        except Exception:
            return None
        C.CACHE.mkdir(parents=True, exist_ok=True); cache[key] = obj; _cache_path().write_text(json.dumps(cache, indent=1))
    try:
        ids = lambda v: [x for x in v if x in C.ORDER] if isinstance(v, list) else None
        inc, exc = ids(obj.get("include", [])), ids(obj.get("exclude", []))
        base = {"current": set(default), "all": set(ALL_MEASURES), "none": set()}.get(obj.get("start_from"))
        if base is None or inc is None or exc is None: return None
        sel = (base | set(inc)) - set(exc)
        return {"retrofits": [r for r in C.ORDER if r in sel], "unsupported": [str(u)[:40] for u in obj.get("unsupported", []) if isinstance(u, str)][:5]}
    except Exception:
        return None


def parse_scenario(text: str, default: list = None, use_llm: bool = True) -> dict:
    """Free text -> {"retrofits", "source", "unsupported", "note"}. Never invents a measure: ids are validated against the catalogue, requests for things outside it
    are reported in `unsupported` (and explained to the user), and a request that names no measure keeps the current selection with an explicit note."""
    default = list(default or []); t = _prep(text.lower())
    if use_llm:
        r = parse_whatif_llm(text, default)
        if r is not None:
            note = ("Not in the retrofit catalogue, so ignored: " + ", ".join(r["unsupported"]) + ".") if r["unsupported"] else ""
            return {"retrofits": r["retrofits"] or default, "source": "llm", "unsupported": r["unsupported"], "note": note}
    excl_text = " ".join(m.group(1) for m in _NEG.finditer(t)); pos_text = _NEG.sub(" ", t)
    recognised = bool(_measures(pos_text) or _measures(excl_text) or re.search(EVERYTHING, pos_text))
    sel = parse_whatif(text, default); uns = _unsupported_in(text); notes = []
    if uns: notes.append("Not in the retrofit catalogue, so ignored: " + ", ".join(uns) + ".")
    if not recognised: notes.append("I could not identify a retrofit in that request, so I kept the current selection.")
    return {"retrofits": sel, "source": "rules", "unsupported": uns, "note": " ".join(notes)}

def facts(a: dict) -> dict:
    """Everything the LLM may state. Pre-rounded; the LLM never computes."""
    base = {"property": a["property"], "data_quality": a["data_quality"], "score_now": a["score"]["score"],
            "class_now": a["score"]["classification"],
            "components": {k: {"sub_score": c["sub_score"], "weight_pct": int(c["weight"] * 100), "points": c["contribution"]}
                           for k, c in a["score"]["components"].items()},
            "key_issues": a["score"]["key_issues"], "intensity_kwh_per_m2": a["score"]["intensity_kwh_m2"],
            "emission_factors_kg_per_kwh": {k: v for k, v in a["emission_factors"].items() if k in ("elec", "gas")}}
    sc = a["scenario"]
    if sc["result"] is None:
        base.update({"savings_unavailable_reason": a["data_quality"]["unavailable_reason"], "scenario_retrofits": []})
        return base
    s = sc["result"]; sa = sc["score_after"]; v = sc["value"]; r0 = lambda x: int(round(x))
    base.update({
        "scenario_retrofits": sc["retrofits"], "infeasible_requested": sc["infeasible_requested"], "scenario_notes": s["notes"],
        "per_retrofit": [{"retrofit": x["retrofit"], "electricity_saving_kwh": r0(x["d_elec"]), "gas_saving_kwh": r0(x["d_gas"]),
                          "carbon_saving_kg": r0(x["carbon_kg"]), "cost_low_gbp": r0(x["cost_low"]), "cost_high_gbp": r0(x["cost_high"])} for x in s["per_retrofit"]],
        "excluded_infeasible": a["excluded"],
        "package": {"baseline_elec_kwh": r0(s["baseline"]["elec"]), "baseline_gas_kwh": r0(s["baseline"]["gas"]),
                    "after_elec_kwh": r0(s["after"]["elec"]), "after_gas_kwh": r0(s["after"]["gas"]),
                    "electricity_saving_kwh": r0(s["saving"]["elec"]), "gas_saving_kwh": r0(s["saving"]["gas"]),
                    "net_saving_kwh": r0(s["saving"]["total"]),
                    "improvement_potential_pct": None if s["improvement_potential_pct"] is None else round(s["improvement_potential_pct"], 1),
                    "carbon_saving_tonnes": round(s["carbon_saving_kg"] / 1000, 2), "bill_saving_gbp": r0(s["bill_saving_gbp"]),
                    "install_cost_low_gbp": r0(s["cost_low"]), "install_cost_high_gbp": r0(s["cost_high"]),
                    "rating_before": a["property"]["energy_rating"], "rating_after": s["rating_after"],
                    "sap_before": r0(s["sap_before"]), "sap_after": r0(s["sap_after"]),
                    "score_after": sa["score"], "class_after": sa["classification"]},
        "package_range_p10_p90": None if not sc.get("uncertainty") else {
            "electricity_saving_kwh": {"low": r0(sc["uncertainty"]["package"]["elec"][0]), "high": r0(sc["uncertainty"]["package"]["elec"][2])},
            "gas_saving_kwh": {"low": r0(sc["uncertainty"]["package"]["gas"][0]), "high": r0(sc["uncertainty"]["package"]["gas"][2])},
            "carbon_saving_tonnes": {"low": round(sc["uncertainty"]["package"]["carbon_kg"][0] / 1000, 2), "high": round(sc["uncertainty"]["package"]["carbon_kg"][2] / 1000, 2)}},
        "value_impact": None if v is None else {"uplift_pct_low": round(v["low_pct"], 1), "uplift_pct_high": round(v["high_pct"], 1),
                                                 "value_low_gbp": r0(v["low_gbp"]), "value_high_gbp": r0(v["high_gbp"])}})
    return base


# ------------------------------------------------------------------ slots: the LLM never writes digits
def slot_table(f: dict) -> dict:
    """Flatten FACTS to {path: value} for every numeric / short-string leaf the LLM may reference."""
    out = {}
    def walk(o, path):
        if isinstance(o, bool) or o is None: return
        if isinstance(o, (int, float)): out[path] = o
        elif isinstance(o, str) and len(o) <= 24 and path.split(".")[-1] in ("rating_before", "rating_after", "class_now", "class_after"): out[path] = o
        elif isinstance(o, dict): [walk(v, f"{path}.{k}" if path else str(k)) for k, v in o.items()]
        elif isinstance(o, list) and o and isinstance(o[0], dict) and "retrofit" in o[0]:
            for x in o: [walk(v, f"{path}.{x['retrofit']}.{k}") for k, v in x.items() if k != "retrofit"]
    walk(f, ""); return out


_SLOT = re.compile(r"\[\[\s*([\w.]+?)\s*(\|abs)?\s*\]\]")
_UNIT_AFTER = {"kwh": r"^\s*kWh", "pct": r"^\s*(%|percent|pp)", "tonnes": r"^\s*(t\b|t CO|tonnes?)", "kg": r"^\s*kg"}


def render_slots(text: str, f: dict):
    """Replace [[path]] with the engine value. Returns (rendered_text, problems). Problems: unknown slot, any digit typed outside a slot,
    or a slot whose neighbouring unit does not match the field (e.g. a kWh value presented as pounds)."""
    table = slot_table(f); problems = []; pieces = []; last = 0
    for m in _SLOT.finditer(text):
        pieces.append(text[last:m.start()]); path, absf = m.group(1), bool(m.group(2))
        if path not in table: problems.append(f"unknown slot [[{path}]]"); val = "?"
        else:
            v = table[path]
            if isinstance(v, (int, float)):
                v = abs(v) if absf else v
                val = f"{int(v):,}" if float(v).is_integer() else f"{v:g}"
            else: val = str(v)
            key = path.split(".")[-1]; after = text[m.end():m.end() + 14]; before = text[max(0, m.start() - 6):m.start()]
            for tag, pat in _UNIT_AFTER.items():
                if tag in key and not re.search(pat, after, re.I) and not (tag == "pct" and "%" in before): problems.append(f"slot [[{path}]] is not followed by its unit")
            if "gbp" in key and not re.search(r"(£|GBP)\s*$", before, re.I): problems.append(f"slot [[{path}]] is not preceded by a pound sign")
        pieces.append(val); last = m.end()
    pieces.append(text[last:]); rendered = "".join(pieces)
    stripped = _SLOT.sub(" ", text); stripped = re.sub(r"(?m)^\s*\d+[.)]\s+", "", stripped); stripped = stripped.replace("/100", " ")   # list numbering and the "/100" denominator are allowed
    if re.search(r"\d", stripped): problems.append("digits typed outside a slot: " + ", ".join(sorted(set(re.findall(r"\d[\d,.]*", stripped)))[:6]))
    return rendered, problems


# ------------------------------------------------------------------ guardrail
# 1) every number must equal a number in FACTS at the precision it is written (no tolerance, no unit scaling except the explicit kg<->tonnes pair);
# 2) rule-based claim checks: direction of fuel changes, class names, measures, feasibility, value availability, over-claiming.
# Known limit: it cannot detect a false NON-numeric statement about the home (e.g. "your roof is damp") that mentions no measure, number or class.
_NUM = re.compile(r"(?<![\w.])\d[\d,]*(?:\.\d+)?")
_CLASSES = ["Highly efficient", "Very poor", "Moderate", "Good", "Poor"]
_UNSUPPORTED_MEASURES = ["battery", "hot water cylinder", "draught", "draft", "lighting", "led ", "underfloor heating", "wind turbine", "biomass", "air conditioning",
                         "triple glazing", "ground source", "district heating upgrade", "green roof"]
_OVERCLAIM = re.compile(r"\b(guarantee[sd]?|definitely|certainly|proven|will save|will cut|will reduce|will increase|will raise|assured|risk-free)\b", re.I)
_NEGATION = re.compile(r"\b(not|no|never|neither|nor|without|isn't|aren't|cannot|can't|doesn't|don't)\b", re.I)
_UP = re.compile(r"\b(rise|rises|rising|increase|increases|increased|increasing|higher|more|up|grow|grows)\b", re.I)
_DOWN = re.compile(r"\b(fall|falls|falling|drop|drops|decrease|decreases|reduce|reduces|reduced|reduction|lower|cut|cuts|saving|savings|save|saves)\b", re.I)
_UNFEAS = re.compile(r"not feasible|infeasible|cannot|can't|not recommended|unavailable|excluded|not suitable|not possible|skipped|unable", re.I)
_SAVINGS = re.compile(r"\bkWh\b|\bsaving|\bsave|\bcut\b|\breduc|\bt CO2|\bkg\b|\btonnes?\b", re.I)


def _unit_of_key(key: str) -> str:
    k = key.lower()
    if "per_m2" in k or "intensity" in k: return "other"
    for tag in ("kwh", "pct", "gbp", "tonnes", "kg"):
        if tag in k: return tag
    return "other"


def _collect(obj, pools, key=""):
    if isinstance(obj, bool) or obj is None: return
    if isinstance(obj, (int, float)):
        v = float(obj)
        if v == v:
            u = _unit_of_key(key); vals = {round(v, 6), round(abs(v), 6)} | {round(x, d) for x in (v, abs(v)) for d in (0, 1, 2)}
            if u == "kg": vals_t = {round(v / 1000, 2), round(abs(v) / 1000, 2)}; pools["tonnes"] |= vals_t
            if u == "tonnes": pools["kg"] |= {round(v * 1000, 0), round(abs(v) * 1000, 0)}
            pools[u] |= vals; pools["all"] |= vals
    elif isinstance(obj, dict): [_collect(v, pools, key if str(k) in ("low", "high") else str(k)) for k, v in obj.items()]   # low/high inherit the parent's unit
    elif isinstance(obj, list): [_collect(v, pools, key) for v in obj]
    elif isinstance(obj, str):
        for x in re.findall(r"\d+\.?\d*", obj.replace(",", "")):
            if x not in ("", "."): pools["other"].add(float(x)); pools["all"].add(float(x))


def _allowed(f: dict) -> dict:
    pools = {k: set() for k in ("kwh", "pct", "gbp", "tonnes", "kg", "other", "all")}
    for c in (100.0, 7.0, float(len(f.get("scenario_retrofits", []))), float(len(f.get("components", {})))): pools["other"].add(c); pools["all"].add(c)   # "/100", seven components, count of measures
    _collect(f, pools); return pools


def _unit_in_text(line: str, m) -> str:
    after = line[m.end():m.end() + 12]; before = line[max(0, m.start() - 4):m.start()]
    if re.search(r"(£|GBP)\s*$", before, re.I): return "gbp"
    if re.match(r"\s*kWh\s*/\s*m", after, re.I): return "other"
    if re.match(r"\s*kWh", after, re.I): return "kwh"
    if re.match(r"\s*(%|percent|pp\b)", after, re.I): return "pct"
    if re.match(r"\s*(t CO2|tonnes?|t\b)", after, re.I): return "tonnes"
    if re.match(r"\s*kg", after, re.I): return "kg"
    return "all"


def unsupported_numbers(text: str, f: dict) -> list:
    """Numbers in `text` not present in FACTS at the precision written. Exact match; numbers with a unit (kWh, %, GBP, t CO2e, kg) must match a FACTS value
    of that unit, so a stray '8 kWh' cannot be excused by an unrelated 8 elsewhere."""
    pools = _allowed(f); bad = []
    for line in text.split("\n"):
        line = re.sub(r"^\s*\d+[.)]\s+", "", line)                   # list numbering
        for m in _NUM.finditer(line):
            tok = m.group(0).rstrip(",")
            try: v = float(tok.replace(",", ""))
            except ValueError: continue
            dec = len(tok.split(".")[1]) if "." in tok else 0; pool = pools[_unit_in_text(line, m)]
            if not any(round(a, dec) == round(v, dec) for a in pool): bad.append(tok)
    return bad


def _negated(text: str, pos: int) -> bool:
    return bool(_NEGATION.search(text[max(0, pos - 30):pos]))


def claim_violations(text: str, f: dict) -> list:
    """Rule-based claim checks. Returns human-readable violations."""
    v = []; pk = f.get("package"); low = text.lower()
    for m in _OVERCLAIM.finditer(text):
        if not _negated(text, m.start()): v.append(f"over-claim: '{m.group(0)}'")
    for w in _UNSUPPORTED_MEASURES:
        if w in low: v.append(f"measure not in the retrofit catalogue: '{w.strip()}'")
    infeas = {x["retrofit"] for x in f.get("infeasible_requested", [])} | {x["retrofit"] for x in f.get("excluded_infeasible", [])}
    for sent in re.split(r"(?<=[.!?])\s+|\n+", text):
        sl = sent.lower(); ms = {k for k, ws in KEYWORDS.items() if any(w in sl for w in ws)}
        for k in ms & infeas:
            if _SAVINGS.search(sent) and not _UNFEAS.search(sent) and k not in set(f.get("scenario_retrofits", [])):
                v.append(f"savings claimed for infeasible/excluded measure: {k}")
        clean = re.sub(r"\([^)]*\)", " ", sent)                      # ignore explanatory parentheticals such as "(positive = saving, negative = rises)"
        if pk:
            for clause in re.split(r"\b(?:while|but|whereas)\b|[;,]", clean):
                cl = clause.lower(); fuel = "elec" if re.search(r"electric|grid", cl) else "gas" if re.search(r"\bgas\b", cl) else None
                if not fuel: continue
                spec = [k for k, ws in KEYWORDS.items() if any(w in cl for w in ws)]
                row = next((x for x in f["per_retrofit"] if x["retrofit"] in spec), None) if spec else None
                val = (row["electricity_saving_kwh"] if fuel == "elec" else row["gas_saving_kwh"]) if row else (pk["electricity_saving_kwh"] if fuel == "elec" else pk["gas_saving_kwh"])
                rise = bool(re.search(r"\b(rise|rises|rising|increase|increases|increased|higher|more|grow|grows|up)\b|negative saving", cl))
                fall = bool(re.search(r"\b(fall|falls|falling|drop|drops|decrease|decreases|reduce|reduces|reduced|reduction|lower|cut|cuts|save|saves|saving|savings)\b", cl)) and "negative saving" not in cl
                if rise == fall: continue                               # no claim, or ambiguous
                if _negated(clause, 0) and re.match(r"\s*(not|no|never)\b", cl): continue
                if abs(val) < 1:
                    v.append(f"claims a {'electricity' if fuel == 'elec' else 'gas'} change but the engine reports none"); continue
                expected_fall = val > 0                                  # positive saving = consumption falls
                if (fall and not expected_fall) or (rise and expected_fall):
                    v.append(f"direction of {'electricity' if fuel == 'elec' else 'gas'} change contradicts the engine (saving {val:+,} kWh)")
    allowed_classes = {f.get("class_now"), (pk or {}).get("class_after")}
    for m in re.finditer(r"\((Highly efficient|Very poor|Moderate|Good|Poor)\)|classified as (Highly efficient|Very poor|Moderate|Good|Poor)|\b(Highly efficient|Very poor)\b", text):
        c = next(g for g in m.groups() if g)
        if c not in allowed_classes: v.append(f"class '{c}' is not this home's class")
    if f.get("value_impact") is None and re.search(r"value[^.]*\d+(\.\d+)?\s*%|[£]\s?\d[\d,]*[^.]*value|value[^.]*£\s?\d", text, re.I):
        v.append("value impact stated although unavailable")
    return v


def check_text(text: str, f: dict) -> dict:
    """Sentence-level and atomic-claim-level verification of an explanation against FACTS."""
    sents = [x for x in re.split(r"(?<=[.!?])\s+|\n+", text) if x.strip()]
    nums_total = nums_bad = 0; viol_total = 0; bad_sents = 0; details = []
    for sent in sents:
        nb = unsupported_numbers(sent, f); cv = claim_violations(sent, f)
        nums_total += len(_NUM.findall(sent)); nums_bad += len(nb); viol_total += len(cv)
        if nb or cv: bad_sents += 1; details.append({"sentence": sent[:140], "unsupported_numbers": nb, "violations": cv})
    checkable = nums_total + sum(1 for s_ in sents if re.search(r"electric|gas|class|\(|measure|feasib|value", s_.lower()))
    return {"ok": not details, "n_sentences": len(sents), "bad_sentences": bad_sents, "numbers": nums_total, "unsupported_numbers": nums_bad, "claim_violations": viol_total,
            "details": details, "checked_atoms": max(nums_total + viol_total, 1)}


def template_explanation(f: dict, question: str = "") -> str:
    out = [f"**Green Home Score: {f['score_now']}/100 ({f['class_now']}).** "
           + ("Main issues: " + "; ".join(f["key_issues"]) + "." if f["key_issues"] else "No major weak components.")]
    dq = f["data_quality"]
    if dq["usage_source"] != "metered":
        if dq.get("elec_months") is None and dq.get("gas_months") is None:
            out.append("No energy readings were provided, so energy figures are model estimates for a home like yours and the energy-use part of the score is left out (the score is provisional).")
        else:
            out.append("Metered usage was unavailable (too few months or no winter month), so energy figures are model estimates and the energy-intensity component is excluded from the score.")
    for c in dq.get("conflicts", []): out.append("Please check your inputs: " + c["message"])
    if f.get("savings_unavailable_reason"):
        out.append(f"Savings, carbon and value impact are unavailable: {f['savings_unavailable_reason']}.")
        return "\n\n".join(out)
    for x in f["infeasible_requested"]:
        out.append((f"{x['retrofit']} cannot be estimated yet: {x['reason'].replace('Status unknown: ', '')}." if x.get("needs_info") else f"{x['retrofit']} is not feasible here: {x['reason']}."))
    if f["scenario_retrofits"]:
        pk, v = f["package"], f["value_impact"]
        out.append(f"**Scenario ({', '.join(f['scenario_retrofits'])}):** estimated electricity change {pk['electricity_saving_kwh']:+,} kWh/yr and gas change "
                   f"{pk['gas_saving_kwh']:+,} kWh/yr (positive = saving, negative = consumption rises), net {pk['net_saving_kwh']:,} kWh/yr "
                   f"({pk['improvement_potential_pct']}% of purchased energy). Estimated carbon reduction {pk['carbon_saving_tonnes']} t CO2e/yr. "
                   f"Estimated rating {pk['rating_before']} to {pk['rating_after']}; score {f['score_now']} to {pk['score_after']} ({pk['class_after']}). "
                   f"Indicative installation cost GBP {pk['install_cost_low_gbp']:,} to {pk['install_cost_high_gbp']:,}.")
        rg = f.get("package_range_p10_p90")
        if rg: out.append(f"Likely range (P10 to P90 over catalogue assumptions): electricity {rg['electricity_saving_kwh']['low']:+,} to {rg['electricity_saving_kwh']['high']:+,} kWh/yr, gas {rg['gas_saving_kwh']['low']:+,} to {rg['gas_saving_kwh']['high']:+,} kWh/yr.")
        out += f["scenario_notes"]
        out.append(f"Estimated value impact: {v['uplift_pct_low']}% to {v['uplift_pct_high']}% (GBP {v['value_low_gbp']:,} to {v['value_high_gbp']:,}), an indicative range from historical sales relationships, not a guaranteed or causal increase."
                   if v else "Property-value impact cannot be estimated (no current value estimate).")
    else:
        out.append("No feasible retrofit was selected, so there are no savings to report.")
    out.append("All figures are estimates, not guarantees.")
    return "\n\n".join(out)


def generate(a: dict, question: str = "") -> dict:
    """One LLM call (needs ANTHROPIC_API_KEY). Returns raw text, rendered text (slots filled from the engine), slot problems and the facts used."""
    import anthropic
    f = facts(a); slots = "\n".join(f"{k} = {v}" for k, v in slot_table(f).items())
    msg = anthropic.Anthropic().messages.create(
        model=MODEL, max_tokens=700, system=SYSTEM,
        messages=[{"role": "user", "content": f"FACTS:\n{json.dumps(f, default=str)}\n\nSLOTS (use these names only):\n{slots}\n\nCUSTOMER QUESTION: {question or 'Explain my score and what I should do.'}"}])
    raw = "".join(b.text for b in msg.content if b.type == "text"); text, problems = render_slots(raw, f)
    return {"raw": raw, "text": text, "problems": problems, "facts": f}


def explain(a: dict, question: str = "") -> dict:
    f = facts(a); tmpl = template_explanation(f, question)
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return {"text": tmpl, "source": "template (no API key)", "facts": f, "unsupported": []}
    try:
        g = generate(a, question); chk = check_text(g["text"], f)
        issues = g["problems"] + [d_ for x in chk["details"] for d_ in (x["violations"] + x["unsupported_numbers"])]
        if issues:
            return {"text": tmpl, "source": f"template (LLM output rejected: {issues[:3]})", "facts": f, "unsupported": issues}
        return {"text": g["text"], "source": f"LLM {MODEL} (numbers inserted from engine output; claims checked)", "facts": f, "unsupported": []}
    except Exception as e:  # network/key errors -> still answer
        return {"text": tmpl, "source": "template (the AI explanation service is unavailable, so this is the standard explanation of the engine output)", "facts": f, "unsupported": []}

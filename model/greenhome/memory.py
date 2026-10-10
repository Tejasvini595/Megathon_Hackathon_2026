"""Persistent customer memory (optional extension). It changes WHAT is recommended; every score, saving and cost still comes from the engine.

What is remembered per customer: measures already completed (applied to the home model so the baseline, score and remaining options update), measures declined
(with the reason), constraints (renting, listed building or conservation area, budget) and a stated priority. Free text is parsed by transparent rules (a
Claude parser could replace this; the memory format would not change). Constraints act as HARD filters, never as a model guess:
  renting -> only controls can be changed by a tenant; everything else is marked 'needs landlord consent'
  listed  -> window replacement and solid-wall insulation are marked 'needs consent' (appearance restrictions)
Storage is one small JSON file per customer under reports/cache/memory/ (the id is an opaque string, no personal data is needed)."""
import json, re
import numpy as np
from . import config as C
from . import llm
from .retrofits import analyse_scenario, needs_info
from . import solver

DIR = C.CACHE / "memory"
RENTER_ALLOWED = {"smart_controls"}
LISTED_RESTRICTED = {"double_glazing", "solid_wall_insulation"}
# what the home record looks like once a measure is done; used when the customer reports a measure whose starting condition the model did not know
STATE_AFTER = {"loft_insulation": {"loft_mm": 270.0, "roof_insulation": "insulated"}, "floor_insulation": {"floor_insulation": "insulated"},
               "cavity_wall_insulation": {"wall_insulation_level": 2.0}, "solid_wall_insulation": {"wall_insulation_level": 2.0}, "double_glazing": {"glazing_level": 3.0},
               "smart_controls": {"controls_level": 3.0}, "condensing_boiler": {"boiler_condensing": True}, "solar_pv": {"has_solar_pv": True}}
_DONE = re.compile(r"\b(installed|fitted|already (?:have|got|has)|i have|we have|got|did|done|completed|put in|replaced|upgraded|had)\b", re.I)
_NO = re.compile(r"\b(don.t want|do not want|not interested|declin\w*|too disruptive|too expensive|too costly|no thanks|rather not|refuse\w*|won.t|will not|not doing|no)\b", re.I)
_RENT = re.compile(r"\b(rent|renting|rented|tenant|landlord)\b", re.I)
_LISTED = re.compile(r"\b(listed building|listed|conservation area)\b", re.I)
_BUDGET = re.compile(r"(?:budget|spend|afford|up to|no more than|at most|max(?:imum)?)[^0-9]{0,25}[£]?\s?([0-9][0-9,]*(?:[.][0-9]+)?)\s?(k\b)?", re.I)
_REASON = re.compile(r"(too disruptive|too expensive|too costly|landlord|disruption|cost)", re.I)          # specific reasons first
_REASON_GENERIC = re.compile(r"(not interested|don.t want|do not want|rather not|no thanks)", re.I)


def empty() -> dict:
    return {"completed": [], "declined": {}, "constraints": {"renting": False, "listed": False, "budget_gbp": None}, "priority": None, "log": []}


def _path(cid):
    return DIR / (re.sub(r"[^A-Za-z0-9_-]", "_", str(cid))[:60] + ".json")


def load(cid) -> dict:
    f = _path(cid)
    return json.loads(f.read_text()) if f.exists() else empty()


def save(cid, mem: dict):
    DIR.mkdir(parents=True, exist_ok=True)
    _path(cid).write_text(json.dumps(mem, indent=1))


def parse_note(text: str) -> dict:
    """Free text -> typed memory events (rules). Clauses are split on . ; and 'but'. A clause that names measures is 'declined' if it carries a refusal
    phrase, else 'completed' if it carries a completion phrase. Nothing is inferred beyond the words."""
    out = {"completed": [], "declined": {}, "renting": None, "listed": None, "budget_gbp": None, "priority": None}
    if _RENT.search(text): out["renting"] = True
    if _LISTED.search(text): out["listed"] = True
    m = _BUDGET.search(text)
    if m: out["budget_gbp"] = float(m.group(1).replace(",", "")) * (1000 if m.group(2) else 1)
    low = text.lower()
    if re.search(r"\b(carbon|emissions|environment)\b", low): out["priority"] = "carbon"
    elif re.search(r"\b(bills|cheapest|save money|payback)\b", low): out["priority"] = "bills"
    for clause in re.split(r"[.;]|\bbut\b", text):
        ms = llm._measures(clause.lower())
        if not ms: continue
        if _NO.search(clause) and not re.search(r"\b(already|installed|fitted)\b", clause, re.I):
            rs = _REASON.search(clause) or _REASON_GENERIC.search(clause)
            reason = rs.group(1).lower() if rs else clause.strip()[:60]
            for r in ms: out["declined"][r] = reason
        elif _DONE.search(clause):
            out["completed"] += [r for r in C.ORDER if r in ms]
    return out


def remember(mem: dict, text: str) -> dict:
    """Merge a note into the memory (in place) and log it. Returns the parsed events."""
    ev = parse_note(text)
    for r in ev["completed"]:
        if r not in mem["completed"]: mem["completed"].append(r)
        mem["declined"].pop(r, None)
    for r, why in ev["declined"].items():
        if r not in mem["completed"]: mem["declined"][r] = why
    for k in ("renting", "listed"):
        if ev[k]: mem["constraints"][k] = True
    if ev["budget_gbp"] is not None: mem["constraints"]["budget_gbp"] = ev["budget_gbp"]
    if ev["priority"]: mem["priority"] = ev["priority"]
    mem["log"].append({"note": text, "parsed": ev})
    return ev


def personalise(eng, p: dict, mem: dict):
    """-> (home with completed measures applied, excluded measures {id: reason}, budget, notes).
    Completed measures change the baseline usage, score and feasibility of what is left."""
    notes, excl, p2 = [], {}, dict(p)
    done = list(mem["completed"])
    if done:
        e0, g0, src = eng.baseline(p)
        scen = analyse_scenario(p, e0, g0, done)
        applied = scen["selected"]
        skipped = [r for r in done if r not in applied]
        if applied:
            a = scen["after"]
            p2.update(scen["new_state"])
            p2.update(sap_score=scen["sap_after"], energy_rating=scen["rating_after"], elec_annual=a["elec"], gas_annual=a["gas"], usage_status="metered",
                      elec_months=12, gas_months=12, intensity=(a["elec"] + a["gas"]) / p["floor_area"], memory_applied=applied)
            notes.append("Applied your completed work to the home model: " + ", ".join(C.LABEL[r] for r in applied)
                         + ". Baseline energy, rating and score are model estimates updated from your report, not meter readings.")
        unknown = needs_info(p)
        recorded = [r for r in skipped if r in unknown and r in STATE_AFTER]
        for r in recorded: p2.update(STATE_AFTER[r])
        if recorded:
            notes.append("Recorded as done: " + ", ".join(C.LABEL[r] for r in recorded) + ". The starting condition was not known, so the energy baseline is not adjusted for it.")
        skipped = [r for r in skipped if r not in recorded]
        if skipped:
            notes.append("Could not apply (not feasible for this home as entered): " + ", ".join(C.LABEL[r] for r in skipped) + ".")
        for r in done: excl[r] = "already done"
    for r, why in mem["declined"].items(): excl[r] = "you declined it (" + why + ")"
    if mem["constraints"].get("renting"):
        for r in C.ORDER:
            if r not in RENTER_ALLOWED: excl.setdefault(r, "needs landlord consent (you rent)")
    if mem["constraints"].get("listed"):
        for r in LISTED_RESTRICTED: excl.setdefault(r, "needs consent (listed building or conservation area)")
    return p2, excl, mem["constraints"].get("budget_gbp"), notes


def plan_with_memory(eng, p: dict, mem: dict, top: int = 3) -> dict:
    p2, excl, budget, notes = personalise(eng, p, mem)
    res = solver.plan(eng, p2, exclude=set(excl), budget_gbp=budget, top=top)
    res["memory_notes"] = notes
    res["excluded_by_memory"] = excl
    res["priority"] = mem.get("priority")
    if res.get("options") and mem.get("priority") == "carbon":
        res["options"] = sorted(res["options"], key=lambda o: -o["carbon_kg"])
    return res


def journey(eng, p: dict, notes: list, top: int = 3) -> list:
    """Demo and test helper: apply notes one at a time to an empty memory and show how the plan changes after each. Step 0 is the plan with no memory."""
    mem = empty()
    steps, prev = [], None
    for text in [None] + list(notes):
        ev = remember(mem, text) if text else None
        r = plan_with_memory(eng, p, mem, top)
        first = (r.get("options") or [None])[0]
        sig = tuple(first["retrofits"]) if first else None
        steps.append({"note": text, "parsed": ev, "reachable": r.get("reachable"), "current": r.get("current"), "target": r.get("target"),
                      "best_package": list(sig) if sig else None, "best_cost_mid": round(first["cost_mid"]) if first else None,
                      "best_score_after": first["score_after"] if first else None, "changed": sig != prev,
                      "excluded_by_memory": dict(r.get("excluded_by_memory", {})), "notes": r.get("memory_notes", []), "plan_note": r.get("note", "")})
        prev = sig
    return steps

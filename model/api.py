"""HTTP service for the web app: the engine computes, the web app's LLM explains.   uv run uvicorn api:app --port 8000
No LLM is called here: /check verifies an explanation the web app generated against the engine's facts."""
from functools import lru_cache
from typing import Any
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from greenhome import config as C, llm
from greenhome.service import AppEngine, APP_ID

app = FastAPI(title="Green Home engine")


@lru_cache(maxsize=1)
def engine() -> AppEngine:
    return AppEngine()


class Home(BaseModel):
    record: dict[str, Any]
    place: dict[str, Any] = {}


class Scenario(Home):
    retrofits: list[str] | None = None


class PlanIn(Home):
    memory: dict[str, Any] | None = None
    top: int = 3


class SensitivityIn(Home):
    alternatives: dict[str, dict[str, float]]


class ParseIn(BaseModel):
    text: str
    current: list[str] = []


class CheckIn(BaseModel):
    text: str
    facts: dict[str, Any]


def _run(fn):
    try:
        return fn()
    except KeyError as e:          # a required record field is missing
        raise HTTPException(422, f"missing or invalid field: {e}")


@app.get("/health")
def health():
    return {"ok": True, "modelVersion": engine().version, "calibrated": C.CALIBRATED}


@app.post("/twin")
def twin(h: Scenario):
    return _run(lambda: engine().twin(h.record, h.place, h.retrofits))


@app.post("/plan")
def plan(h: PlanIn):
    return _run(lambda: engine().plan(h.record, h.place, h.memory, h.top))


@app.post("/sensitivity")
def sensitivity(h: SensitivityIn):
    """Which review questions matter for this home (the decision model supplies the probabilities, the engine the stakes)."""
    return _run(lambda: engine().sensitivity(h.record, h.place, h.alternatives))


@app.get("/llm/prompt")
def prompt():
    """The explanation system prompt (rules: no digits, slots only, ...), kept next to the checks that enforce it."""
    return {"system": llm.SYSTEM, "measures": {APP_ID.get(r, r): C.LABEL[r] for r in C.ORDER}}


@app.post("/parse")
def parse(p: ParseIn):
    """Rule-based what-if parser (the fallback when the web app's LLM parser is unavailable)."""
    ids = {v: k for k, v in APP_ID.items()}
    r = llm.parse_scenario(p.text, [ids.get(x, x) for x in p.current], use_llm=False)
    return {**r, "retrofits": [APP_ID.get(x, x) for x in r["retrofits"]]}


@app.post("/check")
def check(c: CheckIn):
    """Fill [[slots]] from the facts and run the number and claim checks. ok=false -> the web app shows the template instead."""
    text, problems = llm.render_slots(c.text, c.facts)
    chk = llm.check_text(text, c.facts)
    issues = problems + [d for x in chk["details"] for d in (x["violations"] + x["unsupported_numbers"])]
    return {"ok": not issues, "text": text, "issues": [str(i) for i in issues], "check": chk}


@app.get("/portfolio")
def portfolio(limit: int = 200, council: str | None = None):
    """Poorly performing dataset homes ranked by improvement potential (precomputed: python -m greenhome.service_portfolio)."""
    f = C.CACHE / "portfolio.parquet"
    if not f.exists():
        raise HTTPException(503, "portfolio not built: run `uv run python -m greenhome.service_portfolio`")
    pf = pd.read_parquet(f)
    if council: pf = pf[pf.local_authority.astype(str) == council]
    cols = ["rank", "property_id", "postcode", "local_authority", "score", "classification", "energy_rating", "intensity_kwh_m2", "floor_area",
            "improvement_potential_pct", "improvement_potential_no_hp_pct", "elec_saving_kwh", "gas_saving_kwh", "carbon_saving_t", "package_cost_gbp",
            "measures", "unavailable_reason", "key_issues"]
    pf = pf.assign(measures=pf.measures.fillna("").map(lambda m: "+".join(APP_ID.get(x, x) for x in m.split("+") if x)))
    out = pf[cols].head(limit).astype(object).where(pf[cols].head(limit).notna(), None)
    return {"councils": sorted(pf.local_authority.astype(str).unique()), "total": int(len(pf)), "rows": out.to_dict("records")}

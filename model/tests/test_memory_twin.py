"""Customer memory in /twin: completed work is applied to the home, declined or not-allowed measures leave the plan, and the score follows."""
from tests.test_api import HOUSE, PLACE, client


def twin(memory=None, rec=HOUSE):
    r = client.post("/twin", json={"record": rec, "place": PLACE, "memory": memory}); assert r.status_code == 200, r.text; return r.json()["twin"]


def ids(t):
    return [r["id"] for r in t["retrofits"]]


def test_no_memory_matches_plain_twin():
    assert twin() == twin({"completed": [], "declined": {}})


def test_completed_measure_is_applied_and_leaves_the_plan():
    base, done = twin(), twin({"completed": ["loft_insulation"], "declined": {}})
    assert "loft_insulation" in ids(base) and "loft_insulation" not in ids(done)
    assert any(x["id"] == "loft_insulation" and "already done" in x["reason"] for x in done["excluded"])
    assert done["elementScores"]["roof"] > base["elementScores"]["roof"]
    assert done["score"] >= base["score"] and done["rating"]["sap"] >= base["rating"]["sap"]
    assert done["energy"]["monthsMetered"] == base["energy"]["monthsMetered"]
    assert any(f["field"] == "memory" for f in done["flags"])


def test_declined_heat_pump_drops_it_and_the_alternative():
    t = twin({"completed": [], "declined": {"heat_pump": "too disruptive"}})
    assert "heat_pump" not in ids(t) and t["packageNoHeatPump"] is None
    assert any(x["id"] == "heat_pump" and "declined" in x["reason"] for x in t["excluded"])


def test_renting_keeps_only_tenant_measures():
    t = twin({"completed": [], "declined": {}, "renting": True})
    assert set(ids(t)) <= {"smart_thermostat"}


def test_modelled_home_stays_modelled_after_completed_work():
    t = twin({"completed": ["loft_insulation"], "declined": {}}, {**HOUSE, "usage": None})
    assert t["energy"]["source"] == "modelled"

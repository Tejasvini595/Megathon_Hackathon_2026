"""Contract tests for the web app's engine API (api.py): shapes the web app's zod schema relies on, the estimator path, and the checks."""
import pytest
from fastapi.testclient import TestClient
from api import app

client = TestClient(app)
MONTHS = [("2025-10", 330, 1050), ("2025-11", 360, 1700), ("2025-12", 400, 2150), ("2026-01", 410, 2300), ("2026-02", 380, 1950), ("2026-03", 350, 1500),
          ("2026-04", 320, 950), ("2026-05", 300, 600), ("2026-06", 280, 420), ("2026-07", 290, 400), ("2026-08", 300, 430), ("2026-09", 380, 750)]
HOUSE = dict(propertyType="house", builtForm="semi", storeys=2, ageBand="1950_1966", floorAreaM2=85, rooms=5, wallType="cavity", wallInsulation="none",
             roofType="gable", loftInsulation="thin", floorType="solid", floorInsulation="none", glazing="single", heating="gas_boiler", boilerAge="before_2005",
             controls="thermostat_trvs", solarPv="no", epcBand="E", sapScore=47, usage={"months": [{"month": m, "elecKwh": a, "gasKwh": b} for m, a, b in MONTHS]})
PLACE = {"postcode": "M14 6HT", "lat": 53.45, "lon": -2.22, "region": "E12000002", "country": "E92000001", "district": "Manchester"}
TWIN_KEYS = {"rating", "score", "scoreClass", "scoreRange", "components", "keyIssues", "isPoor", "elementScores", "energy", "carbonKg", "retrofits", "excluded",
             "needsInfo", "package", "packageNoHeatPump", "value", "flags", "unavailableReason", "modelVersion"}


def twin(rec, place=PLACE, retrofits=None):
    r = client.post("/twin", json={"record": rec, "place": place, "retrofits": retrofits}); assert r.status_code == 200, r.text; return r.json()


def test_twin_shape_and_recorded_rating():
    t = twin(HOUSE)["twin"]
    assert set(t) == TWIN_KEYS
    assert t["rating"] == {"sap": 47.0, "band": "E", "source": "recorded", "range": None}
    assert t["scoreRange"] is None and 0 <= t["score"] <= 100 and len(t["components"]) == 7
    assert {r["id"] for r in t["retrofits"]} >= {"loft_insulation", "cavity_wall_insulation", "smart_thermostat"}
    r0 = t["retrofits"][0]
    assert set(r0["gasSavingKwh"]) == {"p10", "p50", "p90"} and r0["gasSavingKwh"]["p10"] <= r0["gasSavingKwh"]["p90"]
    assert t["energy"]["source"] == "metered" and t["energy"]["monthsMetered"] == 12


def test_unknown_epc_uses_estimator_with_range():
    t = twin({**HOUSE, "epcBand": "unknown", "sapScore": None})["twin"]
    assert t["rating"]["source"] == "estimated" and t["rating"]["range"]["sap"][0] <= t["rating"]["sap"] <= t["rating"]["range"]["sap"][1]
    assert t["scoreRange"]["low"] <= t["score"] <= t["scoreRange"]["high"]
    assert next(c for c in t["components"] if c["key"] == "energy_efficiency")["estimated"] is True
    assert any(f["field"] == "rating_estimated" for f in t["flags"])


def test_flat_with_home_below_has_no_floor_part_and_scotland_is_flagged():
    flat = dict(propertyType="flat", builtForm="flat", flatLevel="top", blockStoreys=6, ageBand="2003_2006", floorAreaM2=62, rooms=3, wallType="cavity",
                wallInsulation="full", roofType="flat", flatRoofInsulation="full", glazing="double", heating="electric_room", controls="programmer",
                solarPv="no", epcBand="C", sapScore=None, usage={"annual": {"elecKwh": 4200, "gasKwh": 0}})
    t = twin(flat, {**PLACE, "region": "S99999999", "country": "S92000003", "lat": 55.95})["twin"]
    assert t["elementScores"]["floor"] is None and t["rating"]["source"] == "band"
    assert any(f["field"] == "outside_training_area" for f in t["flags"])


def test_scenario_and_llm_facts_and_check():
    out = twin(HOUSE, retrofits=["heat_pump", "solar_pv"])
    assert out["twin"]["package"]["retrofits"] == ["heat_pump", "solar_pv"]
    f = out["llm"]["facts"]
    good = client.post("/check", json={"text": "Your score is [[score_now]]/100. These are estimates, not guarantees.", "facts": f}).json()
    assert good["ok"] and str(f["score_now"]) in good["text"]
    bad = client.post("/check", json={"text": "This will save you 99999 kWh a year.", "facts": f}).json()
    assert not bad["ok"]


def test_parse_plan_prompt_health():
    assert client.post("/parse", json={"text": "what if I add solar and a smart thermostat", "current": []}).json()["retrofits"] == ["smart_thermostat", "solar_pv"]
    p = client.post("/plan", json={"record": HOUSE, "place": PLACE, "memory": {"budget_gbp": 6000}}).json()
    assert p["available"] and all(o["cost_mid"] <= 6000 for o in p["options"])
    assert "NEVER" in client.get("/llm/prompt").json()["system"]
    assert client.get("/health").json()["ok"]


def test_missing_required_field_is_422():
    r = client.post("/twin", json={"record": {k: v for k, v in HOUSE.items() if k != "glazing"}, "place": PLACE})
    assert r.status_code == 422

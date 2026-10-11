"""The /methods transparency payload: shape, and that the documented weights are the fixed ones."""
from fastapi.testclient import TestClient
from api import app

client = TestClient(app)


def test_methods_shape():
    r = client.get("/methods"); assert r.status_code == 200, r.text
    m = r.json()
    assert {"score", "carbon", "retrofits", "value", "finance", "evidence", "limitations"} <= set(m)
    assert abs(sum(w["weight"] for w in m["score"]["weights"]) - 1) < 1e-9
    assert len(m["score"]["components"]) == 7 and all(c["tables"] for c in m["score"]["components"])
    assert {f["fuel"] for f in m["carbon"]["factors"]} == {"Electricity", "Gas"} and m["carbon"]["source"]
    assert m["retrofits"] and all(r["costLowGbp"] <= r["costHighGbp"] for r in m["retrofits"])
    assert m["finance"]["loans"] and m["limitations"] and m["value"]["note"]
    ev = m["evidence"]
    assert set(ev["splits"]) == {"val", "test", "geo_test"} and {t["id"] for t in ev["tiers"]} == {"A", "B", "C"}
    assert ev["rows"] and all(set(r["values"]) == set(ev["splits"]) for r in ev["rows"])

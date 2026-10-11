"""Green finance illustration: annuity maths, the EPC C test, and the block the app engine returns."""
import pytest
from fastapi.testclient import TestClient
from api import app
from greenhome import config as C, finance
from test_api import HOUSE, PLACE, twin

client = TestClient(app)


def test_repayment_known_value_zero_apr_and_no_principal():
    assert finance.repayment(10000, 6, 5) == pytest.approx(193.33, abs=0.01)
    assert finance.repayment(12000, 0, 10) == pytest.approx(100)
    assert finance.repayment(0, 7, 10) == 0 and finance.repayment(-5, 7, 10) == 0


def test_bill_saving_pairs_low_with_low_and_can_be_negative():
    s = finance.bill_saving_month({"p10": 12000, "p50": 14000, "p90": 16000}, {"p10": -3000, "p50": -2500, "p90": -2000})
    assert s[0] < s[1] < s[2] and s[0] == pytest.approx((12000 * C.TARIFF["gas"] - 3000 * C.TARIFF["elec"]) / 12)
    neg = finance.bill_saving_month({"p10": 0, "p50": 0, "p90": 0}, {"p10": -3000, "p50": -2500, "p90": -2000})
    assert neg[1] < 0
    opt = finance.plan_finance("full", "x", ["heat_pump"], [8000, 12000], neg, 70, "C", {"sap": 60, "band": "D", "source": "recorded", "range": None}, None)["options"][0]
    assert opt["netGbp"][0] > opt["repaymentGbp"][0] and opt["netGbp"][0] <= opt["netGbp"][1]      # bills rise, so net is above the repayment


def test_reaches_c_for_each_rating_source():
    rec = lambda sap: {"sap": sap, "band": "D", "source": "recorded", "range": None}
    assert finance.reaches_c(75, rec(60)) == "yes" and finance.reaches_c(70, rec(60)) == "borderline" and finance.reaches_c(66, rec(60)) == "no"
    est = {"sap": 60, "band": "D", "source": "estimated", "range": {"sap": [55, 66], "band": ["D", "D"]}}
    assert finance.reaches_c(74, est) == "yes" and finance.reaches_c(70, est) == "borderline" and finance.reaches_c(60, est) == "no"      # 14 points gained: 55+14 = 69
    band = {"sap": 61.5, "band": "D", "source": "band", "range": None}
    assert finance.reaches_c(75.5, band) == "yes" and finance.reaches_c(70, band) == "borderline" and finance.reaches_c(60, band) == "no"


def fin(rec=HOUSE, place=PLACE, retrofits=None):
    return twin(rec, place, retrofits)["twin"]["finance"]


def test_twin_finance_shape_and_ordering():
    f = fin()
    assert f["thresholdSap"] == 69 and f["alreadyC"] is False and "not financial advice" in f["note"]
    assert {l["id"] for l in f["assumptions"]["loans"]} == {"personal", "mortgage"} and f["assumptions"]["sources"]
    full = f["plans"][0]; assert full["id"] == "full" and len(full["options"]) == 4
    for p in f["plans"]:
        assert p["costGbp"][0] <= p["costGbp"][1] and p["reachesC"] in ("yes", "borderline", "no") and len(p["billSavingMonthGbp"]) == 3
        for o in p["options"]:
            assert o["repaymentGbp"][0] <= o["repaymentGbp"][1] and o["netGbp"][0] <= o["netGbp"][1] and o["interestGbp"][0] <= o["interestGbp"][1]
            assert o["netGbp"][0] == o["repaymentGbp"][0] - p["billSavingMonthGbp"][2] or abs(o["netGbp"][0] - (o["repaymentGbp"][0] - p["billSavingMonthGbp"][2])) <= 1
    to_c = next((p for p in f["plans"] if p["id"] == "toC"), None)
    if to_c:
        assert to_c["reachesC"] == "yes" and set(to_c["retrofits"]) < set(full["retrofits"]) and to_c["costGbp"][1] <= full["costGbp"][1]


def test_grant_only_with_heat_pump_and_not_in_scotland():
    f = fin(retrofits=["heat_pump"])
    assert f["assumptions"]["heatPumpGrantGbp"] == 7500 and f["plans"][0]["costWithGrantGbp"] is not None and len(f["plans"]) == 1
    assert fin(retrofits=["loft_insulation"])["plans"][0]["costWithGrantGbp"] is None
    s = fin(retrofits=["heat_pump"], place={**PLACE, "region": "S99999999", "country": "S92000003", "lat": 55.95})
    assert s["assumptions"]["heatPumpGrantGbp"] is None and s["plans"][0]["costWithGrantGbp"] is None


def test_finance_facts_are_slots_and_pass_check():
    out = twin(HOUSE)
    f = out["llm"]["facts"]["finance"]
    assert f["loan_term_years"] == 10 and f["monthly_repayment_low_gbp"] <= f["monthly_repayment_high_gbp"]
    assert "finance.monthly_net_high_gbp" in out["llm"]["slots"]
    txt = "An illustration at assumed rates, not advice: about £[[finance.monthly_repayment_low_gbp]] a month. These are estimates, not guarantees."
    assert client.post("/check", json={"text": txt, "facts": out["llm"]["facts"]}).json()["ok"]

"""Green finance illustration: what a retrofit plan would cost per month on a loan, against the bill it saves. Every energy and cost figure
comes from the engine; the only additions are the documented loan assumptions in config.FINANCE. An illustration, not financial advice."""
from . import config as C

NOTE = "Illustration only, not financial advice or a quote. Rates are assumptions; a lender's terms, fees and eligibility will differ."


def repayment(principal: float, apr_pct: float, years: int) -> float:
    """Monthly payment on a standard annuity loan."""
    n = years * 12
    if principal <= 0 or n <= 0: return 0.0
    r = apr_pct / 12 / 100
    return principal / n if r == 0 else principal * r / (1 - (1 + r) ** -n)


def bill_saving_month(gas_kwh, elec_kwh) -> list:
    """[low, mid, high] GBP/month from per-fuel kWh bands (each a dict or triple of p10, p50, p90). Low pairs low with low and high with high,
    which is conservative: the extremes of the two fuels rarely coincide, so the range is wider than the true spread."""
    g, e = (list(x.values()) if isinstance(x, dict) else list(x) for x in (gas_kwh, elec_kwh))
    return [(g[i] * C.TARIFF["gas"] + e[i] * C.TARIFF["elec"]) / 12 for i in range(3)]


def reaches_c(sap_after: float, rating: dict) -> str:
    """yes / borderline / no: does the plan lift the home to EPC C (SAP >= 69) allowing for how uncertain today's rating is."""
    delta = sap_after - rating["sap"]
    if rating["source"] == "estimated": lo, hi = rating["range"]["sap"]
    elif rating["source"] == "band": lo, hi = C.SAP_BAND_BOUNDS[rating["band"]]
    else: lo, hi = rating["sap"] - C.FINANCE["borderlineSap"], rating["sap"] + C.FINANCE["borderlineSap"]
    lo, hi = lo + delta, hi + delta
    return "yes" if lo >= C.EPC_C_SAP else "borderline" if hi >= C.EPC_C_SAP else "no"


def _option(loan, term, cost, saving, grant):
    rep = lambda c: repayment(c, loan["aprPct"], term)
    pair = lambda lo, hi, sl, sh: [round(rep(lo) - sh), round(rep(hi) - sl)]
    rng = lambda c: [round(rep(c[0])), round(rep(c[1]))]
    low, high = saving[0], saving[2]
    gc = None if grant is None else [max(0, c - grant) for c in cost]
    return {"loan": loan["id"], "termYears": term, "repaymentGbp": rng(cost), "netGbp": pair(*cost, low, high),
            "repaymentWithGrantGbp": None if gc is None else rng(gc), "netWithGrantGbp": None if gc is None else pair(*gc, low, high),
            "interestGbp": [round(rep(cost[0]) * term * 12 - cost[0]), round(rep(cost[1]) * term * 12 - cost[1])]}


def plan_finance(pid, label, retrofits, cost, saving, sap_after, band_after, rating, grant) -> dict:
    """cost [lo, hi] GBP, saving [low, mid, high] GBP/month, grant GBP or None (None: not applicable to this plan)."""
    cost = [round(c) for c in cost]
    gc = None if grant is None else [max(0, c - grant) for c in cost]
    return {"id": pid, "label": label, "retrofits": retrofits, "costGbp": cost, "costWithGrantGbp": gc,
            "billSavingMonthGbp": [round(s) for s in saving], "sapAfter": round(sap_after, 1), "bandAfter": band_after,
            "reachesC": reaches_c(sap_after, rating),
            "options": [_option(l, t, cost, saving, grant) for l in C.FINANCE["loans"] for t in l["terms"]]}


def finance_block(plans: list, rating: dict, grant_gbp) -> dict:
    return {"thresholdSap": C.EPC_C_SAP, "alreadyC": rating["sap"] >= C.EPC_C_SAP, "plans": plans,
            "assumptions": {"loans": C.FINANCE["loans"], "tariffGbpPerKwh": dict(C.TARIFF), "heatPumpGrantGbp": grant_gbp, "sources": C.FINANCE["sources"]},
            "note": NOTE}

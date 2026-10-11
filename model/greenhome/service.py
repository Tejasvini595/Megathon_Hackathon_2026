"""The engine as the web app sees it: app record in, the app's TwinState (web/src/lib/twin/types.ts) out, plus the facts the LLM may
use. Every number here comes from the engine; this module only selects, renames and labels.
LLM inference happens in the web app; this side supplies the facts, the slot table, the prompt, the template and the checks."""
import hashlib
from pathlib import Path
import numpy as np
import pandas as pd
from . import config as C, llm, solver, memory, finance
from .engine import GreenEngine
from .models import load
from .custom import HDD_FILE
from .scoring import green_score, element_scores
from .retrofits import analyse_scenario, band_of, carbon_saving, monte_carlo, recommend
from .app_input import property_from_record

APP_ID = {"smart_controls": "smart_thermostat"}             # the app's id for the same measure
ENGINE_ID = {v: k for k, v in APP_ID.items()}
ELEMENT = {"loft_insulation": "roof", "cavity_wall_insulation": "walls", "solid_wall_insulation": "walls", "floor_insulation": "floor",
           "double_glazing": "windows", "smart_controls": "system", "heat_pump": "system", "condensing_boiler": "system", "solar_pv": "roof_pv"}
FIELD_OF = {"loft_insulation": "loftInsulation", "floor_insulation": "floorInsulation", "cavity_wall_insulation": "wallInsulation",
            "solid_wall_insulation": "wallInsulation", "double_glazing": "glazing", "smart_controls": "controls", "condensing_boiler": "boilerAge", "solar_pv": "solarPv"}
COMPONENT = {"energy_efficiency": ("energy_efficiency", "Energy efficiency"), "energy_intensity": ("consumption_intensity", "Energy use per m²"),
             "insulation": ("insulation", "Insulation"), "heating": ("heating", "Heating system"), "glazing": ("glazing", "Windows & glazing"),
             "renewable": ("renewables", "Renewables"), "smart": ("smart", "Smart controls")}
SAP_MID = C.SAP_MID
BANDS = "ABCDEFG"
MC_DRAWS = 150


def _model_version() -> str:
    """Hash of the models and the engine code: the web app keys its twin cache on it, so any change to either re-runs saved homes."""
    h = hashlib.sha1()
    files = [f for f in sorted(C.MODELS.glob("*")) if f.suffix in (".joblib", ".json")] + sorted(Path(__file__).parent.glob("*.py"))
    for f in files: h.update(f.name.encode()); h.update(f.read_bytes())
    return h.hexdigest()[:12]


def _band(lo, mid, hi) -> dict:
    return {"p10": round(float(lo)), "p50": round(float(mid)), "p90": round(float(hi))}


class AppEngine:
    def __init__(self):
        self.eng = GreenEngine(lite=True)
        self.eng.rel = load("relevance_model_app")                  # relevance refitted on what the app collects
        self.sap = load("sap_model")
        self.hdd = pd.read_parquet(HDD_FILE)
        self.version = _model_version()

    # ------------------------------------------------------------------ inputs
    def home(self, rec: dict, place: dict):
        """-> (engine property with SAP filled, rating, notes)."""
        p, notes = property_from_record(rec, place, self.eng.ref, self.hdd)
        est, lo, hi = (float(v[0]) for v in self.sap.predict(pd.DataFrame([p])))
        band, sap_given = rec.get("epcBand"), rec.get("sapScore")
        if band and band != "unknown":
            sap, source = (float(sap_given), "recorded") if sap_given else (float(SAP_MID[band]), "band")
            if abs(BANDS.index(band) - BANDS.index(band_of(est))) >= 2:
                notes.append({"code": "rating_conflict", "message": f"Your EPC rating ({band}) is far from what your answers suggest ({band_of(est)}). "
                              "The certificate may be out of date, or an answer may need checking."})
            rating = {"sap": round(sap, 1), "band": band, "source": source, "range": None}
        else:
            sap, band = est, band_of(est)
            rating = {"sap": round(est, 1), "band": band, "source": "estimated", "range": {"sap": [round(lo, 1), round(hi, 1)], "band": [band_of(hi), band_of(lo)]}}
            notes.append({"code": "rating_estimated", "message": "No EPC rating given: the energy-efficiency part of the score uses a rating estimated "
                          "from your answers (shown with its likely range)."})
        p.update(sap_score=sap, energy_rating=band)
        return p, rating, notes

    # ------------------------------------------------------------------ outputs
    def _package(self, p, scen, sc_after, unc, elec, gas):
        pk = unc["package"] if unc else None
        b = lambda key, val: _band(*pk[key]) if pk else _band(val, val, val)
        r = scen
        return {"retrofits": [APP_ID.get(x, x) for x in r["selected"]],
                "gasSavingKwh": b("gas", r["saving"]["gas"]), "elecSavingKwh": b("elec", r["saving"]["elec"]), "carbonSavingKg": b("carbon_kg", r["carbon_saving_kg"]),
                "improvementPotentialPct": None if r["improvement_potential_pct"] is None else round(r["improvement_potential_pct"], 1),
                "costGbp": [round(r["cost_low"]), round(r["cost_high"])], "billSavingGbp": round(r["bill_saving_gbp"]),
                "scoreAfter": sc_after["score"], "classAfter": sc_after["classification"], "sapAfter": round(r["sap_after"], 1), "bandAfter": r["rating_after"],
                "elementScoresAfter": element_scores({**p, **r["new_state"]})}

    def twin(self, rec: dict, place: dict, scenario=None) -> dict:
        p, rating, notes = self.home(rec, place)
        scen_ids = None if scenario is None else [ENGINE_ID.get(x, x) for x in scenario]
        a = self.eng.analyse_property(p, scen_ids)
        elec, gas, src = self.eng.baseline(p)
        inten = p["intensity"] if src == "metered" else np.nan
        sc = a["score"]
        score_range = None
        if rating["source"] == "estimated":
            lo_s, hi_s = (green_score(dict(p, sap_score=s, intensity=inten))["score"] for s in rating["range"]["sap"])
            score_range = {"low": min(lo_s, hi_s), "high": max(lo_s, hi_s)}
        elif sc["partial"]:
            score_range = sc["bounds"]
        comps = []
        for k, c in sc["components"].items():
            key, label = COMPONENT[k]
            comps.append({"key": key, "label": label, "weight": c["weight"], "subScore": c["sub_score"], "contribution": c["contribution"],
                          "maxContribution": c["max_contribution"], "estimated": k == "energy_efficiency" and rating["source"] == "estimated",
                          "reason": self._reason(k, p, rating, sc)})
        s = a["scenario"]; res = s["result"]
        retrofits, pkg, pkg_nohp = [], None, None
        if res is not None:
            per_mc = (s["uncertainty"] or {}).get("per_retrofit", {})
            per = {x["retrofit"]: x for x in res["per_retrofit"]}
            recs = {r["retrofit"]: r for r in a["recommendations"]}
            for i, rid in enumerate(res["selected"], 1):
                x, r, mc = per[rid], recs.get(rid, {}), per_mc.get(rid)
                alone = self.eng_scenario(p, elec, gas, [rid], src, inten)
                pb = r.get("payback_years")
                retrofits.append({"id": APP_ID.get(rid, rid), "label": C.LABEL[rid], "order": i, "suitability": r.get("suitability", "Low"),
                                  "relevance": (lambda m: {"tier": m["relevance"], "confidence": m["confidence"]} if m else None)(r.get("ml_relevance")),
                                  "element": ELEMENT[rid], "reason": r.get("reason", x.get("reason", "")),
                                  "gasSavingKwh": _band(*mc["gas"]) if mc else _band(x["d_gas"], x["d_gas"], x["d_gas"]),
                                  "elecSavingKwh": _band(*mc["elec"]) if mc else _band(x["d_elec"], x["d_elec"], x["d_elec"]),
                                  "carbonSavingKg": _band(*mc["carbon_kg"]) if mc else _band(x["carbon_kg"], x["carbon_kg"], x["carbon_kg"]),
                                  "costGbp": [round(x["cost_low"]), round(x["cost_high"])], "billSavingGbp": round(x["bill_saving_gbp"]),
                                  "paybackYears": pb, "scoreAfter": alone["score"]})
            if res["selected"]:
                pkg = self._package(p, res, s["score_after"], s["uncertainty"], elec, gas)
            if scenario is None and "heat_pump" in res["selected"] and a.get("package_no_hp", {}).get("selected"):
                nh = a["package_no_hp"]
                pkg_nohp = self._package(p, nh, solver._score_after(p, nh, src, inten), monte_carlo(p, elec, gas, nh["selected"], n=MC_DRAWS), elec, gas)
        value = s.get("value")
        up = self.eng.vm.uplift_batch(pd.DataFrame([{"sap_score": p["sap_score"]}]), [res["sap_after"]]).iloc[0] if res and res["selected"] else None
        flags = [{"field": n["code"], "message": n["message"], "severity": "warn" if n["code"] in ("rating_conflict", "outside_training_area") else "info"} for n in notes]
        flags += [{"field": c["code"], "message": c["message"], "severity": "warn"} for c in a["data_quality"]["conflicts"]]
        if src != "metered":
            flags.append({"field": "usage", "message": "No usable meter readings: energy figures are model estimates and the energy-use part of the score is left out.", "severity": "warn"})
        twin = {"rating": rating, "score": sc["score"], "scoreClass": sc["classification"], "scoreRange": score_range, "components": comps,
                "keyIssues": sc["key_issues"], "isPoor": sc["is_poor"], "elementScores": element_scores(p),
                "energy": {"gasKwh": round(gas), "elecKwh": round(elec), "otherKwh": round((p.get("heat_network_annual") or 0) + (p.get("other_fuel_annual") or 0)),
                           "intensityKwhM2": sc["intensity_kwh_m2"], "source": src, "monthsMetered": int(p["elec_months"]) if p["elec_months"] == p["elec_months"] else 0,
                           "monthly": p.get("monthly") or []},
                "carbonKg": round(carbon_saving(elec, gas)),
                "retrofits": retrofits,
                "excluded": [{"id": APP_ID.get(x["retrofit"], x["retrofit"]), "reason": x["reason"]} for x in a["excluded"] if x["retrofit"] in C.LABEL],
                "needsInfo": [{"id": APP_ID.get(n["retrofit"], n["retrofit"]), "question": n["question"], "field": FIELD_OF.get(n["retrofit"])} for n in a["needs_information"]],
                "package": pkg, "packageNoHeatPump": pkg_nohp,
                "value": {"currentGbp": None if np.isnan(p["current_value_estimate"]) else round(p["current_value_estimate"]),
                          "upliftPct": None if up is None else [round(float(up.low_pct), 1), round(float(up.high_pct), 1)],
                          "valueAfterGbp": None if not value else [round(value["low_gbp"]), round(value["high_gbp"])],
                          "note": "Indicative range from how ratings relate to sale prices in the dataset; associational, not a proven effect."},
                "finance": self._finance(res, scenario, pkg, pkg_nohp, rating, notes, p, elec, gas),
                "flags": flags, "unavailableReason": a["data_quality"]["unavailable_reason"], "modelVersion": self.version}
        f = llm.facts(a)
        f["rating_source"] = rating["source"]
        if rating["range"]: f["rating_estimated_range"] = {"sap_low": rating["range"]["sap"][0], "sap_high": rating["range"]["sap"][1]}
        f["notes"] = [n["message"] for n in notes]
        if twin["finance"]: f["finance"] = self._finance_facts(twin["finance"])
        return {"twin": twin, "llm": {"facts": f, "slots": llm.slot_table(f), "template": llm.template_explanation(f)}}

    def _finance(self, res, scenario, pkg, pkg_nohp, rating, notes, p, elec, gas):
        """Loan repayments against bill savings for the package, the fabric-only alternative and the shortest start of the ordered package that reaches EPC C."""
        if pkg is None: return None
        grant = None if any(n["code"] == "outside_training_area" for n in notes) else C.FINANCE["heatPumpGrantGbp"]
        plan = lambda pid, label, k: finance.plan_finance(pid, label, k["retrofits"], k["costGbp"], finance.bill_saving_month(k["gasSavingKwh"], k["elecSavingKwh"]),
                                                          k["sapAfter"], k["bandAfter"], rating, grant if "heat_pump" in k["retrofits"] else None)
        plans = [plan("full", "Recommended plan" if scenario is None else "This scenario", pkg)]
        if pkg_nohp: plans.append(plan("noHeatPump", "Without the heat pump", pkg_nohp))
        if scenario is None and rating["sap"] < C.EPC_C_SAP:
            for n in range(1, len(res["selected"])):
                r = analyse_scenario(p, elec, gas, res["selected"][:n])
                if finance.reaches_c(r["sap_after"], rating) != "yes": continue
                s = r["saving"]; one = lambda kwh: {"p10": kwh, "p50": kwh, "p90": kwh}
                k = {"retrofits": [APP_ID.get(x, x) for x in r["selected"]], "costGbp": [r["cost_low"], r["cost_high"]], "sapAfter": r["sap_after"],
                     "bandAfter": r["rating_after"], "gasSavingKwh": one(s["gas"]), "elecSavingKwh": one(s["elec"])}
                plans.append(plan("toC", "First steps to EPC C", k)); break
        return finance.finance_block(plans, rating, grant)

    @staticmethod
    def _finance_facts(fin) -> dict:
        full = fin["plans"][0]; o = next(x for x in full["options"] if x["loan"] == "personal" and x["termYears"] == 10)
        loan = next(l for l in fin["assumptions"]["loans"] if l["id"] == "personal")
        out = {"monthly_repayment_low_gbp": o["repaymentGbp"][0], "monthly_repayment_high_gbp": o["repaymentGbp"][1], "monthly_bill_saving_gbp": full["billSavingMonthGbp"][1],
               "monthly_net_low_gbp": o["netGbp"][0], "monthly_net_high_gbp": o["netGbp"][1], "loan_apr_pct": loan["aprPct"], "loan_term_years": 10,
               "reaches_epc_c": full["reachesC"], "illustration_only": "Illustration with assumed loan terms, not financial advice or a quote."}
        to_c = next((x for x in fin["plans"] if x["id"] == "toC"), None)
        if to_c: out.update(to_c_cost_low_gbp=to_c["costGbp"][0], to_c_cost_high_gbp=to_c["costGbp"][1])
        return out

    def eng_scenario(self, p, elec, gas, ids, src, inten):
        return solver._score_after(p, analyse_scenario(p, elec, gas, ids), src, inten)

    @staticmethod
    def _reason(k, p, rating, sc) -> str:
        if k == "energy_efficiency":
            return {"recorded": f"EPC {rating['band']} (SAP {rating['sap']:g})", "band": f"EPC {rating['band']} (band midpoint)",
                    "estimated": f"Estimated ≈ {rating['band']} from your answers"}[rating["source"]]
        if k == "energy_intensity":
            return "Metered energy per m² a year" if sc["intensity_kwh_m2"] is not None else "Needs meter readings"
        if k == "insulation":
            return f"Walls {p['wall_insulation']}, roof {p['roof_insulation']}, floor {p['floor_insulation']}".replace("_", " ")
        if k == "heating":
            cond = {True: ", condensing", False: ", non-condensing"}.get(p.get("boiler_condensing"), "")
            return str(p["heating_detail"]).replace("_", " ").capitalize() + cond
        if k == "glazing":
            return str(p["glazing"]).replace("_", " ").capitalize() + " glazing"
        if k == "renewable":
            return f"Solar PV {p['solar_kwp_est']:g} kW" if p.get("has_solar_pv") else "No solar or other generation"
        return {"none": "No heating controls", "basic": "Timer only", "standard": "Programmer, room thermostat and TRVs", "advanced": "Smart or zoned controls"}[p["controls_label"]]

    def _quick(self, rec: dict, place: dict) -> dict:
        """Score, recommended package, score after it and its bill change: the engine's rules without the Monte Carlo or the
        relevance model, fast enough to try every plausible answer to every question."""
        p, _, _ = self.home(rec, place)
        elec, gas, src = self.eng.baseline(p)
        inten = p["intensity"] if src == "metered" else np.nan
        score = green_score(dict(p, intensity=inten))["score"]
        if p["fuel_scope"] != "gas_elec":
            return {"score": score, "measures": (), "after": score, "bill": 0.0}
        pack = recommend(p, elec, gas)["package"]
        return {"score": score, "measures": tuple(pack["selected"]), "after": solver._score_after(p, pack, src, inten)["score"], "bill": pack["bill_saving_gbp"]}

    def sensitivity(self, rec: dict, place: dict, alternatives: dict) -> dict:
        """For each field with a probability per answer: how much would the score, the plan and the bill saving move if the
        true answer differed from the most likely one (probability-weighted). Ranked so the review asks what matters first."""
        out = []
        for field, probs in alternatives.items():
            probs = {k: float(v) for k, v in (probs or {}).items() if v is not None}
            if field not in rec or not probs:
                continue
            best = max(probs, key=probs.get)
            ref = self._quick({**rec, field: best}, place)
            spread = plan = bill = 0.0
            for opt, pr in probs.items():
                if opt == best or pr < 0.02:
                    continue
                r = self._quick({**rec, field: opt}, place)
                spread += pr * abs(r["score"] - ref["score"]) + pr * abs(r["after"] - ref["after"]) / 2
                plan += pr * (r["measures"] != ref["measures"])
                bill += pr * abs(r["bill"] - ref["bill"])
            out.append({"key": field, "best": best, "score_spread": round(spread, 2), "plan_change_prob": round(plan, 3), "bill_spread_gbp": round(bill)})
        out.sort(key=lambda f: -(f["score_spread"] + 3 * f["plan_change_prob"] + f["bill_spread_gbp"] / 100))
        return {"fields": out, "note": "Impact = probability-weighted change in score (now and after the plan), plan, and bill saving; ranking weight "
                "score points + 3 x P(plan changes) + bill change / 100."}

    def plan(self, rec: dict, place: dict, mem: dict = None, top: int = 3) -> dict:
        p, _, _ = self.home(rec, place)
        m = memory.empty()
        if mem:
            m["completed"] = [ENGINE_ID.get(x, x) for x in mem.get("completed", [])]
            m["declined"] = {ENGINE_ID.get(k, k): v for k, v in (mem.get("declined") or {}).items()}
            m["constraints"].update({k: mem[k] for k in ("renting", "listed", "budget_gbp") if k in mem})
            m["priority"] = mem.get("priority")
        r = memory.plan_with_memory(self.eng, p, m, top)
        ren = lambda ids: [APP_ID.get(x, x) for x in ids]
        for o in (r.get("options") or []) + (r.get("frontier") or []) + ([r["best_reachable"]] if r.get("best_reachable") else []):
            o["retrofits"] = ren(o["retrofits"])
        if "excluded_by_memory" in r: r["excluded_by_memory"] = {APP_ID.get(k, k): v for k, v in r["excluded_by_memory"].items()}
        if "unavailable_measures" in r: r["unavailable_measures"] = {APP_ID.get(k, k): v for k, v in r["unavailable_measures"].items()}
        return r

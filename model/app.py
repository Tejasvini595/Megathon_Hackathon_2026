import json, os
import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st
from greenhome import config as C, llm, solver, memory, breakit
from greenhome.engine import GreenEngine

st.set_page_config(page_title="Green Home Score", page_icon="🏡", layout="wide")
CLS_COL = {"Highly efficient": "#1a7f4b", "Good": "#5aa84f", "Moderate": "#e0a82e", "Poor": "#e0702e", "Very poor": "#c0392b"}
NAMES = {"energy_efficiency": "Energy rating (SAP)", "energy_intensity": "Metered use / m²", "insulation": "Insulation",
         "heating": "Heating system", "glazing": "Glazing", "renewable": "Renewables", "smart": "Heating controls"}
RED = "#c0392b"


@st.cache_resource(show_spinner="Loading data and models…")
def engine(): return GreenEngine()


@st.cache_data(show_spinner="Ranking poorly performing homes (first run only)…")
def portfolio(): return engine().portfolio()


def gauge(score, cls, title):
    f = go.Figure(go.Indicator(mode="gauge+number", value=score, title={"text": f"{title}<br><span style='font-size:0.8em'>{cls}</span>"},
        gauge={"axis": {"range": [0, 100]}, "bar": {"color": CLS_COL[cls]},
               "steps": [{"range": [0, 30], "color": "#f6d5d1"}, {"range": [30, 50], "color": "#f8e1cf"}, {"range": [50, 65], "color": "#f6ecc8"},
                         {"range": [65, 80], "color": "#dcecd4"}, {"range": [80, 100], "color": "#c4e3d0"}]}))
    f.update_layout(height=260, margin=dict(t=70, b=10, l=20, r=20)); return f


def components_chart(sc):
    ks = list(sc["components"]); c = sc["components"]
    pts = [c[k]["contribution"] or 0 for k in ks]; mx = [c[k]["max_contribution"] or 0 for k in ks]
    f = go.Figure()
    f.add_bar(y=[NAMES[k] for k in ks], x=mx, orientation="h", name="Max possible", marker_color="#e3e6e4")
    f.add_bar(y=[NAMES[k] for k in ks], x=pts, orientation="h", name="Points earned", marker_color="#2d7d5a",
              text=[f"{p:.1f} / {m:.0f}" if m else "unknown" for p, m in zip(pts, mx)], textposition="inside")
    f.update_layout(barmode="overlay", height=330, margin=dict(t=10, b=10), yaxis=dict(autorange="reversed"), legend=dict(orientation="h")); return f


def saving_chart(res):
    xs = [C.LABEL[r["retrofit"]] for r in res["per_retrofit"]] + ["PACKAGE"]
    e = [r["d_elec"] for r in res["per_retrofit"]] + [res["saving"]["elec"]]
    g = [r["d_gas"] for r in res["per_retrofit"]] + [res["saving"]["gas"]]
    f = go.Figure([go.Bar(x=xs, y=e, name="Electricity", marker_color="#3b6ea5"), go.Bar(x=xs, y=g, name="Gas", marker_color="#d98a2e")])
    f.update_layout(barmode="group", height=330, yaxis_title="kWh/yr saved (negative = use rises)", margin=dict(t=10)); return f


def scenario_block(a, key="x"):
    s = a["scenario"]; r = s["result"]; v = s["value"]
    if r is None:
        st.info(a["data_quality"]["unavailable_reason"] + ". The score is still shown."); return
    for x in s["infeasible_requested"]:
        if x.get("needs_info"): st.info(f"**{C.LABEL[x['retrofit']]}** cannot be estimated yet: {x['reason'].replace('Status unknown: ', '')}")
        else: st.warning(f"**{C.LABEL[x['retrofit']]}** is not feasible here: {x['reason']}")
    if not s["retrofits"]:
        st.info("The selected measures cannot be estimated yet. Confirm the details above and the scenario will run." if s["infeasible_requested"] and all(x.get("needs_info") for x in s["infeasible_requested"]) else "No feasible retrofit selected.")
        return
    for n in r["notes"]: st.warning(n)
    c = st.columns(5)
    c[0].metric("Score after", f"{s['score_after']['score']}/100", f"{s['score_after']['score'] - a['score']['score']:+d}")
    fuel_txt = lambda x: f"saves {x:,.0f} kWh/yr" if x >= 0 else f"uses {-x:,.0f} kWh/yr more"
    c[1].metric("Electricity", fuel_txt(r["saving"]["elec"]), help="A heat pump uses more electricity while it cuts gas.")
    c[2].metric("Gas", fuel_txt(r["saving"]["gas"]))
    c[3].metric("Carbon cut", f"{r['carbon_saving_kg'] / 1000:.2f} t CO₂e/yr")
    c[4].metric("Value impact", f"+{v['low_pct']:.1f}–{v['high_pct']:.1f}%" if v else "n/a", help="Indicative, associational, not causal. The rating premium differs a lot between cities in the data, so treat the range as indicative only.")
    u = s.get("uncertainty")
    if u:
        pe, pg, pc = u["package"]["elec"], u["package"]["gas"], u["package"]["carbon_kg"]
        st.caption(f"Likely range (P10–P90 over catalogue assumptions{'' if u['calibrated'] else ', UNCALIBRATED: run train.py'}): electricity {pe[0]:+,.0f} to {pe[2]:+,.0f} kWh/yr · gas {pg[0]:+,.0f} to {pg[2]:+,.0f} kWh/yr · carbon {pc[0] / 1000:.2f}–{pc[2] / 1000:.2f} t CO₂e/yr. Estimates, not guarantees.")
    if r["improvement_potential_pct"] is not None:
        st.caption(f"Purchased energy (grid + gas) {r['baseline']['total']:,.0f} → {r['after']['total']:,.0f} kWh/yr ({r['improvement_potential_pct']:.1f}% lower) · "
                   f"estimated EPC rating {a['property']['energy_rating']} → {r['rating_after']} (SAP {r['sap_before']:.0f} → {r['sap_after']:.0f}, a simplified running-cost estimate, separate from the Green Home Score) · "
                   f"indicative cost £{r['cost_low']:,.0f}–£{r['cost_high']:,.0f} · est. bills {'fall' if r['bill_saving_gbp'] >= 0 else 'rise'} by £{abs(r['bill_saving_gbp']):,.0f}/yr (indicative tariffs)")
    else: st.caption("Baseline energy unavailable: improvement potential cannot be computed.")
    cv = a["property"]["current_value_estimate"]
    if v and cv: st.caption(f"Estimated value £{cv:,.0f} → £{v['low_gbp']:,.0f}–£{v['high_gbp']:,.0f} (indicative range from historical sales). All figures are estimates, not guarantees.")
    st.plotly_chart(saving_chart(r), width="stretch", key=f"saving_{key}")


if not C.CALIBRATED: st.warning("Calibration file missing (models/calibration.json): uncertainty bands and SAP gains are uncalibrated. Run `python -m greenhome.train`.")
eng = engine()
if not hasattr(eng, "analyse_property") or not hasattr(eng, "em_lean"):   # engine cached from an older code version -> rebuild once
    st.cache_resource.clear(); st.cache_data.clear(); eng = engine()
df = eng.df
from greenhome import custom
st.title("🏡 Green Home Score & Retrofit Planner")
pf = portfolio()
with st.sidebar:
    mode = st.radio("How do you want to start?", ["Enter my own home", "Look up a home in the dataset"])
    if mode.startswith("Look up"):
        q = st.text_input("Postcode (or start of it) or property ID", placeholder="e.g. B6, L8 1, SE19 1SB, PE2CC48575C")
        ids = eng.search(q) if q else pf.sample(40, random_state=3).property_id.tolist()
        if q and not ids: st.warning("No home found. Postcodes must be in the 10 councils (Barnet, Birmingham, Bristol, Camden, Cardiff, City of London, Croydon, Liverpool, Manchester, Newcastle). IDs look like PE2CC48575C, not P10001.")
        fmt = lambda i: f"{df.at[i, 'postcode']} · {df.at[i, 'property_type']} · EPC {df.at[i, 'energy_rating']}"
        pid = st.selectbox("Home", ids, format_func=fmt) if ids else None
        st.caption("Showing example Poor homes. Search to find any of the 129,318 homes." if not q else f"{len(ids)} match(es)")
    else: pid = None
    st.divider(); st.caption("Score, savings, carbon and value come from documented models. The AI only explains them.")
    st.caption(f"LLM: {'enabled' if os.environ.get('ANTHROPIC_API_KEY') else 'off (template explanations)'}")

home = None
if mode.startswith("Enter"):
    with st.form("home"):
        st.subheader("Tell us about your home")
        st.caption("Fields marked * are needed. Everything else can be left as 'not sure' and will be handled as missing, never as zero.")
        c = st.columns(3)
        x = {"property_type": c[0].selectbox("Property type *", custom.PROPERTY_TYPES), "built_form": c[1].selectbox("Built form", custom.BUILT_FORMS, index=4),
             "floor_area": c[2].number_input("Floor area (m²) *", 20.0, 500.0, 80.0, 1.0)}
        c = st.columns(3)
        x["age_band"] = c[0].selectbox("Age of home *", list(custom.AGE_BANDS), index=2); x["habitable_rooms"] = c[1].number_input("Habitable rooms *", 1, 12, 4)
        x["energy_rating"] = c[2].selectbox("EPC energy rating (A–G) *", list("ABCDEFG"), index=3, help="From your EPC certificate")
        c = st.columns(3)
        x["heating"] = c[0].selectbox("Heating system *", list(custom.HEATING)); x["glazing"] = c[1].selectbox("Windows *", list(custom.GLAZING), index=3)
        x["controls"] = c[2].selectbox("Heating controls *", list(custom.CONTROLS), index=1)
        c = st.columns(3)
        x["wall_type"] = c[0].selectbox("Wall type *", list(custom.WALL_TYPE)); x["wall_ins"] = c[1].selectbox("Wall insulation *", list(custom.WALL_INS))
        loft = c[2].selectbox("Loft insulation depth", ["not sure", "none (0 mm)", "up to 100 mm", "100–199 mm", "200 mm or more"])
        x["loft"] = {"not sure": "unknown", "none (0 mm)": 0, "up to 100 mm": 50, "100–199 mm": 150, "200 mm or more": 270}[loft]
        c = st.columns(3)
        sol = c[0].selectbox("Solar panels", ["not sure", "none", "1 kWp", "2 kWp", "3 kWp", "4 kWp or more"])
        x["solar_kwp"] = {"not sure": None, "none": 0, "1 kWp": 1, "2 kWp": 2, "3 kWp": 3, "4 kWp or more": 4}[sol]
        x["climate"] = c[1].selectbox("Region *", list(custom.CLIMATE)); x["current_value"] = c[2].number_input("Current value £ (optional)", 0, 5_000_000, 0, 5000)
        st.caption("Optional but improves accuracy: your annual energy use from bills.")
        c = st.columns(3)
        x["elec_kwh"] = c[0].number_input("Electricity kWh per year", 0, 60000, 0, 100); x["gas_kwh"] = c[1].number_input("Gas kWh per year", 0, 120000, 0, 100)
        x["setpoint_c"] = c[2].number_input("Usual heating temperature °C (optional, 0 = not sure)", 0.0, 30.0, 0.0, 0.5, help="Helps judge how much a smart thermostat would save.")
        go_ = st.form_submit_button("Calculate my Green Home Score", type="primary")
    if go_:
        x["elec_kwh"] = x["elec_kwh"] or None; x["gas_kwh"] = x["gas_kwh"] if x["elec_kwh"] else None; x["current_value"] = x["current_value"] or None
        st.session_state["custom_p"] = custom.build_property(x, df)
    home = st.session_state.get("custom_p")
    if home is None: st.stop()
    if home["heating_detail"] in ("community", "oil_boiler"): st.info("Your heating type is outside the grid-electricity + gas accounting, so savings, carbon and value will show as unavailable. The score is still calculated.")
    if home["usage_status"] != "metered": st.info("No energy use entered: energy figures use a model estimate from your home's features, and the energy-use part of the score is left out (flagged).")
elif pid is None: st.stop()

run = (lambda sc=None: eng.analyse_property(home, sc)) if home is not None else (lambda sc=None: eng.analyse(pid, sc))
a = run(); sc = a["score"]; p = a["property"]
t1, t2, t3, t6, t7, t4, t5 = st.tabs(["My home", "Recommendations", "What-if", "Plan to next band", "Break it", "Poorly performing homes", "Model evaluation"])

with t1:
    c1, c2 = st.columns([1, 1.4])
    c1.plotly_chart(gauge(sc["score"], sc["classification"], "Green Home Score"), width="stretch")
    c2.subheader("Why this score"); c2.plotly_chart(components_chart(sc), width="stretch")
    st.write(f"**{p['property_type']}** ({str(p['built_form']).lower()}), {p['floor_area']:.0f} m², {p['age_band']} · {p['local_authority']} {p['postcode']} · "
             f"EPC **{p['energy_rating']}** (SAP {p['sap_score']}) · {str(p['heating_detail']).replace('_', ' ')} · {p['wall_type'].replace('_', ' ')} walls ({p['wall_insulation']}) · "
             f"glazing {p['glazing']} · controls {p['controls_label']} · PV {'yes' if p['has_solar_pv'] else 'unknown' if p['has_solar_pv'] is None else 'no'}")
    if sc["is_poor"]: st.error("Flagged as poorly performing. Key issues: " + "; ".join(sc["key_issues"]))
    dq = a["data_quality"]
    if dq["usage_source"] != "metered":
        if dq.get("elec_months") is None and dq.get("gas_months") is None: st.warning("No energy readings were provided: energy figures are model estimates for a home like yours, and the energy-use part of the score is left out.")
        else: st.warning("Metered usage unavailable (too few months or no winter month): energy figures are model estimates and the energy-intensity component is excluded.")
    else: st.caption(f"Energy intensity {sc['intensity_kwh_m2']} kWh/m²/yr from {dq['elec_months']} electricity / {dq['gas_months']} gas metered months (degree-day annualised). Simulated data.")
    if not dq["savings_available"]: st.info(dq["unavailable_reason"])
    FLAG_TEXT = {"flag_missing_photo_supply": "Solar panel status is not known.", "flag_tiny_floor_area": "Floor area is very small (under 20 m²): per-m² figures are unreliable.",
                 "flag_rooms_implausible": "The room count looks implausible for the floor area."}
    for fl in dq["flags"]: st.caption("Data note: " + FLAG_TEXT.get(fl, fl))
    if sc.get("partial"):
        b = sc["bounds"]; miss = ", ".join(NAMES[k] for k in sc["missing"])
        st.warning(f"**Provisional score**: based on {sc['n_known']} of 7 components (not known: {miss}). The weights of the missing components are shared across the known ones. "
                   f"If the missing inputs were as bad as possible the score would be {b['low']}; as good as possible, {b['high']}.")
    for cf in dq.get("conflicts", []): st.warning("Check your inputs: " + cf["message"])
    for n_ in a.get("needs_information", []): st.caption(f"To estimate {C.LABEL[n_['retrofit']]}: {n_['question']}.")
    with st.expander("Component table"):
        st.dataframe(pd.DataFrame([{"Component": NAMES[k], "Weight": f"{int(c['weight']*100)}%", "Sub-score": c["sub_score"], "Points": c["contribution"]}
                                   for k, c in sc["components"].items()]), hide_index=True)

with t2:
    st.subheader("Prioritised retrofits (feasible only, fabric first)")
    if a["recommendations"]:
        st.dataframe(pd.DataFrame([{"#": r["priority"], "Retrofit": r["label"], "Suitability": r["suitability"], "Saving relevance (model)": ((r.get("ml_relevance") or {}).get("relevance", "n/a")), "Confidence": ((r.get("ml_relevance") or {}).get("confidence")),
                                    "Elec saving kWh": round(r["d_elec"]), "Gas saving kWh": round(r["d_gas"]), "Carbon kg": round(r["carbon_kg"]),
                                    "Cost £": f"{r['cost_low']:,.0f}–{r['cost_high']:,.0f}", "Payback yrs": r["payback_years"], "Reason": r["reason"]} for r in a["recommendations"]]),
                     hide_index=True, width="stretch")
        st.caption("Savings are marginal in application order so they add up to the package and account for interactions. Negative = consumption rises. Payback uses the mid-point cost and indicative tariffs.")
        st.markdown("**Not recommended**: " + "; ".join(f"{C.LABEL[x['retrofit']]} ({x['reason']})" for x in a["excluded"] if x["retrofit"] in C.LABEL) if a["excluded"] else "")
    hp = next((r for r in a["recommendations"] if r["retrofit"] == "heat_pump"), None)
    if hp:
        with st.container(border=True):
            st.markdown("**Heat pump: the honest picture**")
            h1, h2, h3, h4 = st.columns(4)
            h1.metric("Carbon", f"cuts {hp['carbon_kg'] / 1000:.2f} t CO₂e/yr" if hp["carbon_kg"] >= 0 else f"adds {-hp['carbon_kg'] / 1000:.2f} t CO₂e/yr")
            h2.metric("Gas", f"saves {hp['d_gas']:,.0f} kWh/yr" if hp["d_gas"] >= 0 else f"uses {-hp['d_gas']:,.0f} kWh/yr more")
            h3.metric("Electricity", f"saves {hp['d_elec']:,.0f} kWh/yr" if hp["d_elec"] >= 0 else f"uses {-hp['d_elec']:,.0f} kWh/yr more", help="A heat pump runs on electricity, so this rises while gas falls.")
            h4.metric("Running cost", f"falls £{hp['bill_saving_gbp']:,.0f}/yr" if hp["bill_saving_gbp"] >= 0 else f"rises £{-hp['bill_saving_gbp']:,.0f}/yr", help="At indicative tariffs (about 27p/kWh electricity, 7p gas). Not a quote.")
            st.caption(("Carbon falls and gas use drops sharply, but electricity use rises, and at today's tariffs the running cost " + ("also falls." if hp["bill_saving_gbp"] > 0 else "does not fall.") +
                        (" Fabric is still weak after the planned measures, so the heat pump would run less efficiently: insulate first." if hp.get("fabric_ready") is False else " Fabric measures are applied before the heat pump.")))
    st.subheader("Full recommended package"); scenario_block(a, "rec")
    if a["scenario"]["result"] is not None and "package_no_hp" in a:
        def pkg_row(label, r_):
            bill = r_["bill_saving_gbp"]
            return {"Package": label, "Measures": ", ".join(C.LABEL[x] for x in r_["selected"]) or "none",
                    "Purchased energy cut": f"{r_['improvement_potential_pct']:.1f}%" if r_["improvement_potential_pct"] is not None else "n/a",
                    "Carbon cut (t CO₂e/yr)": round(r_["carbon_saving_kg"] / 1000, 2), "Bills (indicative tariffs)": f"save £{bill:,.0f}/yr" if bill >= 0 else f"rise £{-bill:,.0f}/yr",
                    "Install cost": f"£{r_['cost_low']:,.0f}–£{r_['cost_high']:,.0f}"}
        rows_ = [pkg_row("A. Fabric-led, no heat pump", a["package_no_hp"])]
        if "heat_pump" in a["scenario"]["retrofits"]: rows_.append(pkg_row("B. Full package with heat pump", a["scenario"]["result"]))
        st.markdown("**Two ways to go**"); st.dataframe(pd.DataFrame(rows_), hide_index=True, width="stretch")
        st.caption("A heat pump cuts carbon and gas a lot but uses more electricity, so at today's indicative tariffs it can raise running costs. Neither package is hidden.")
    ex = llm.explain(a, "Explain my score and what I should do."); st.markdown("#### Explanation"); st.write(ex["text"]); st.caption(f"Source: {ex['source']}")

with t3:
    st.subheader("What-if")
    if not a["data_quality"]["savings_available"]: st.info(a["data_quality"]["unavailable_reason"]); st.stop()
    default = [r["retrofit"] for r in a["recommendations"]][:2]
    opts = st.multiselect("Pick retrofits", C.ORDER, default=default, format_func=C.LABEL.get)
    qq = st.text_input("…or ask in words", placeholder="What if I only add solar and loft insulation?")
    ps = llm.parse_scenario(qq, opts) if qq else None            # typed scenario: rules, or Claude when a key is set (ids validated against the catalogue)
    sel = ps["retrofits"] if ps else opts
    if ps and ps["note"]: st.info(ps["note"])
    if ps: st.caption(f"Request read by: {ps['source']}")
    w = run(sel)   # engine RE-RUN for the scenario before any LLM explanation
    st.caption(f"Scenario: {', '.join(C.LABEL[s] for s in sel) or 'none'}")
    scenario_block(w, "whatif")
    if w["scenario"]["score_after"]:
        gc = st.columns(2); sa = w["scenario"]["score_after"]
        gc[0].plotly_chart(gauge(sc["score"], sc["classification"], "Today"), width="stretch", key="gauge_today")
        gc[1].plotly_chart(gauge(sa["score"], sa["classification"], "After scenario"), width="stretch", key="gauge_after")
        with st.expander("Which components changed?"):
            st.dataframe(pd.DataFrame([{"Component": NAMES[k], "Before": sc["components"][k]["sub_score"], "After": sa["components"][k]["sub_score"]} for k in sc["components"]]), hide_index=True)
            st.caption("The Green Home Score is its own index. It can rise a lot while the EPC rating (SAP) barely moves, and a high score here does not mean EPC A or B.")
    ex = llm.explain(w, qq); st.write(ex["text"]); st.caption(f"Source: {ex['source']}")

with t4:
    st.subheader(f"{len(pf):,} Poor / Very poor homes ranked by improvement potential")
    f1, f2, f3 = st.columns(3)
    las = f1.multiselect("Council", sorted(pf.local_authority.astype(str).unique())); cl = f2.multiselect("Class", ["Poor", "Very poor"])
    rank_by = f3.radio("Rank by", ["Full package", "Fabric-led (no heat pump)"], horizontal=True)
    v = pf if not las else pf[pf.local_authority.astype(str).isin(las)]; v = v if not cl else v[v.classification.isin(cl)]
    col = "improvement_potential_pct" if rank_by == "Full package" else "improvement_potential_no_hp_pct"
    v = v.sort_values(col, ascending=False, na_position="last")
    c = st.columns(4); c[0].metric("Homes", f"{len(v):,}"); c[1].metric("Very poor", int((v.classification == "Very poor").sum()))
    c[2].metric("Median potential", f"{v[col].median():.0f}%"); c[3].metric("Unavailable", int(v[col].isna().sum()), help="Heating outside grid+gas accounting, or no baseline")
    st.caption("Ranked by % cut in purchased energy (grid electricity + gas), same convention before and after. Flagging uses intensity (kWh/m²), not total use, so large homes are not penalised.")
    st.dataframe(v.drop(columns=["rank"]).round(1).head(2000), hide_index=True, width="stretch", height=420)

with t5:
    try: M = json.load(open(C.REPORTS / "metrics.json"))
    except FileNotFoundError: st.warning("Run python -m greenhome.train first."); st.stop()
    st.warning(M["notes"])
    E, T = M["engine_vs_reference"]["test"], "test"; I = M["independent_epc_check"][T]; MC = M["monte_carlo_coverage"][T]; VM = M["value_model"]; HP = VM["heldout_premium_check"]; RL = M["relevance_model"]
    st.subheader("Scorecard in plain English (held-out test homes)")
    st.markdown("**A. Independent evidence** (compared with real EPC data and real sales, not with our own catalogue)")
    st.markdown(f"""
| Question | Our result | Reading |
|---|---|---|
| Apply exactly the measures the real EPC recommended: does our SAP gain match the EPC's own? | average gain **{I['engine_dSAP_mean']:.1f}** vs EPC **{I['epc_dSAP_mean']:.1f}** points; typical error **{I['dSAP_mae']:.1f}**; correlation **{I['dSAP_corr']:.2f}** | {'✅ unbiased after calibration on train homes' if abs(I['engine_dSAP_mean'] - I['epc_dSAP_mean']) < 1 else '⚠️ biased'}; a correlation of 0.7 is decent, not perfect |
| Do our rankings agree with the EPC's own improvement potential? | rank agreement **{E['vs_epc_potential_improvement_spearman']:.2f}** | moderate: the EPC package includes measures we do not model |
| Does our rating-premium range contain the premium seen in real held-out sales? | val {'✅' if HP['val']['inside_our_train_only_range'] else '❌'} ({HP['val']['premium_pct_per_10_sap']}%), test {'✅' if HP['test']['inside_our_train_only_range'] else '❌'} ({HP['test']['premium_pct_per_10_sap']}%), unseen city {'✅' if HP['geo_test']['inside_our_train_only_range'] else '❌'} ({HP['geo_test']['premium_pct_per_10_sap']}%) per 10 SAP points | the premium varies strongly between cities, so an unseen city can fall outside |
| Do the savings bands cover the reference savings about 80% of the time? | electricity **{MC['elec_saving'] * 100:.0f}%**, gas **{MC['gas_saving'] * 100:.0f}%**, improvement **{MC['improvement_pct'] * 100:.0f}%** | ✅ after widening factors fitted on train homes |
| Annual energy for homes with no meter data (gas error) | **{M['energy_model'][T]['gas_mae']:.0f} kWh** vs **{M['energy_model'][T]['gas_baseline_mae']:.0f} kWh** (typical for type and size) | ✅ better than the baseline (against simulated usage) |
| Home price, typical error (known cities) | **{VM[T]['median_ape_pct']:.0f}%** vs **{VM[T]['baseline_outcode_pm2_median_ape_pct']:.0f}%** (area £/m²) | ✅ better in known cities; in an unseen city (Liverpool) error is **{VM['geo_test']['median_ape_pct']:.0f}%** vs **{VM['geo_test']['baseline_hpi_council_type_average_median_ape_pct']:.0f}%** for the council HPI average: better than the baseline but less accurate, so the level is indicative |
""")
    st.markdown("**B. Partly circular evidence** (compared with the dataset's simulated labels, which use the same catalogue percentages as our engine, so strong agreement is expected, not proof)")
    st.markdown(f"""
| Question | Our result | Simple baseline |
|---|---|---|
| Ranking homes by retrofit potential like the reference labels (1.0 = identical) | **{E['improvement_rank_spearman']:.2f}** | {E['baseline_rank_by_epc_rating_spearman']:.2f} (rank by EPC rating) |
| Predicted % energy cut, typical error | **{E['improvement_pct_mae_pp']:.1f} points** | {E['baseline_constant_mae_pp']:.1f} points (guess the average) |
| Gas saved per home, typical error | **{E['gas_saving_mae_kwh']:.0f} kWh** of {E['gas_saving_mean_true_kwh']:.0f} | n/a |
| Retrofit relevance (High/Medium/Low) on the measures that are not near-constant, macro-F1 | **{RL[T]['informative_measures_only']['macro_f1']:.2f}** (unseen city **{RL['geo_test']['informative_measures_only']['macro_f1']:.2f}**) | {RL[T]['informative_measures_only']['baseline_popularity_macro_f1']:.2f} (most common class per measure); {RL[T]['informative_measures_only']['ablation_no_usage_features_macro_f1']:.2f} without metered-usage features. Labels are a rule on simulated savings, so this is re-learning a rule. |
| Same classifier, keeping its ~80% most confident predictions ("needs survey" for the rest) | accuracy **{RL[T]['with_abstention']['acc'] * 100:.0f}%** at **{RL[T]['with_abstention']['coverage'] * 100:.0f}%** coverage (unseen city **{RL['geo_test']['with_abstention']['acc'] * 100:.0f}%**) | **{RL[T]['acc'] * 100:.0f}%** with no abstention |
""")
    try:
        L = json.load(open(C.REPORTS / "llm_eval.json")); LT = L["template"]
        st.markdown("**C. Explanation layer** (`python -m greenhome.llm_eval`)")
        st.markdown(f"Template explanations over {L['n_scenarios']} scenarios: groundedness **{LT['groundedness'] * 100:.0f}%**, factual accuracy **{LT['factual_accuracy'] * 100:.0f}%**, unsupported claims **{LT['unsupported_claim_rate'] * 100:.0f}%**, completeness **{LT['completeness'] * 100:.0f}%**. "
                    f"Guardrail catches **{min(v['recall'] for k, v in L['red_team_slot_mode_llm_style'].items()) * 100:.0f}%+** of LLM-style corruptions (digits typed, unknown slot, wrong unit); it cannot catch an invented non-numeric statement about the home. "
                    + ("LLM output was evaluated." if isinstance(L["llm_raw_output"], dict) else "The LLM itself has NOT been evaluated yet (needs a key: `python -m greenhome.llm_eval --llm`)."))
    except FileNotFoundError: st.caption("Run `python -m greenhome.llm_eval` for the explanation-layer evaluation.")
    st.caption("A result only means something if it beats its simple baseline. The relevance classifier is in table B because it re-learns a rule.")
    for k in ("score_diagnostics", "annualisation_vs_true"): st.markdown(f"**{k.replace('_', ' ').title()}**"); st.json(M[k])
    for k in ("energy_model", "relevance_model", "value_model", "engine_vs_reference"):
        st.markdown(f"**{k.replace('_', ' ').title()}** (val · test · geo_test = unseen city)")
        if k == "relevance_model":
            st.dataframe(pd.json_normalize({sp: M[k][sp] for sp in ("val", "test", "geo_test")}, sep=".").T.rename(columns={0: "value"}).loc[lambda z: ~z.index.str.contains("per_measure|coverage_curve")].round(3))
            st.caption("Per measure (test): accuracy vs majority-class accuracy"); st.dataframe(pd.DataFrame(M[k]["test"]["per_measure"]).T)
        else:
            st.dataframe(pd.DataFrame({sp: v for sp, v in M[k].items() if isinstance(v, dict) and sp in ("val", "test", "geo_test")}).round(3))
        if k == "value_model":
            st.caption("Rating premium per 10 SAP points (train-only fit and production fit on train+val; associational, not causal):"); st.json({x: M[k][x] for x in ("rating_premium_trainonly", "rating_premium_production_train_plus_val", "premium_by_council_train", "heldout_premium_check")}); st.caption(M[k]["note"])
        if k == "relevance_model" and "note" in M[k]: st.caption(M[k]["note"])
    st.markdown("**EPC-recommendation model (AUC by measure, test; only rows with informative=true mean much)**"); st.json(M["epc_recommendation_model"]["test"]); st.caption(M["epc_recommendation_model"]["note"])
    st.markdown("**Calibration (fitted on train homes only)**"); st.json(M["calibration"])
    st.markdown("**Per-measure savings vs reference (test)**"); st.dataframe(pd.DataFrame(M["per_measure_alone"]["test"]).T.round(0))


with t6:
    st.subheader("What gets me to the next band?")
    if not a["data_quality"]["savings_available"]: st.info(a["data_quality"]["unavailable_reason"])
    else:
        hp_ = home if home is not None else eng.prop(pid)
        mem = st.session_state.setdefault("mem", memory.empty())
        st.caption("Tell the planner about your situation or what you have already done. It remembers, and the plan changes (every number still comes from the engine).")
        note = st.text_input("Your situation", placeholder="e.g. I rent  ·  I installed loft insulation last year  ·  I don't want a heat pump, too disruptive  ·  budget 4k", key="memnote")
        mc1, mc2 = st.columns(2)
        if mc1.button("Remember this") and note: memory.remember(mem, note)
        if mc2.button("Forget everything"): st.session_state["mem"] = memory.empty(); mem = st.session_state["mem"]
        res = memory.plan_with_memory(eng, hp_, mem)
        if mem["completed"] or mem["declined"] or mem["constraints"]["renting"] or mem["constraints"]["listed"] or mem["constraints"]["budget_gbp"]:
            st.markdown("**What I remember**: " + "; ".join(x for x in [
                ("done: " + ", ".join(C.LABEL[r] for r in mem["completed"])) if mem["completed"] else "",
                ("declined: " + ", ".join(f"{C.LABEL[r]} ({w})" for r, w in mem["declined"].items())) if mem["declined"] else "",
                "you rent" if mem["constraints"]["renting"] else "", "listed building / conservation area" if mem["constraints"]["listed"] else "",
                f"budget £{mem['constraints']['budget_gbp']:,.0f}" if mem["constraints"]["budget_gbp"] else "", f"priority: {mem['priority']}" if mem["priority"] else ""] if x))
        for n_ in res.get("memory_notes", []): st.info(n_)
        if not res.get("available"): st.info(res.get("reason", ""))
        else:
            st.write(f"Now **{res['current']['score']}/100 ({res['current']['class']})**" + (f" → target **{res['target']['class']} ({res['target']['score']}+)**" if res.get("target") else ""))
            if res["options"]:
                st.dataframe(pd.DataFrame([{"Measures": ", ".join(o["labels"]), "Install cost": f"£{o['cost_low']:,.0f}–£{o['cost_high']:,.0f}", "Score after": f"{o['score_after']} ({o['class_after']})",
                                            "Electricity": ("saves " if o["d_elec"] >= 0 else "uses ") + f"{abs(o['d_elec']):,.0f} kWh" + ("" if o["d_elec"] >= 0 else " more"),
                                            "Gas": ("saves " if o["d_gas"] >= 0 else "uses ") + f"{abs(o['d_gas']):,.0f} kWh" + ("" if o["d_gas"] >= 0 else " more"),
                                            "Carbon cut (t/yr)": round(o["carbon_kg"] / 1000, 2), "Bills": (f"save £{o['bill_saving_gbp']:,.0f}/yr" if o["bill_saving_gbp"] >= 0 else f"rise £{-o['bill_saving_gbp']:,.0f}/yr"),
                                            "Payback (yrs)": o["payback_years"]} for o in res["options"]]), hide_index=True, width="stretch")
                st.caption(f"Cheapest packages that reach the target, from {res['n_evaluated']} combinations of the measures available to you. {res['label']}")
            elif res.get("note"): st.warning(res["note"])
            if res.get("frontier"):
                fr = res["frontier"]; fig = go.Figure(go.Scatter(x=[o["cost_mid"] for o in fr], y=[o["score_after"] for o in fr], mode="lines+markers", text=[", ".join(o["labels"]) for o in fr], hovertemplate="%{text}<br>£%{x:,.0f} → %{y}"))
                fig.update_layout(height=280, margin=dict(l=10, r=10, t=30, b=10), xaxis_title="Package cost (£, mid-point)", yaxis_title="Green Home Score after", title="Best score for each budget")
                st.plotly_chart(fig, width="stretch")
            if res.get("excluded_by_memory"): st.caption("Left out because of what you told me: " + "; ".join(f"{C.LABEL[r]} ({w})" for r, w in res["excluded_by_memory"].items()))

with t7:
    st.subheader("Break it")
    st.caption("Inject a fault into this home and watch the system flag it, abstain or explain instead of guessing.")
    kind = st.selectbox("Fault", list(breakit.KINDS), format_func=breakit.KINDS.get)
    base_ = home if home is not None else eng.prop(pid)
    if base_.get("usage_status") != "metered" and kind in ("rating_A_but_huge_use", "rating_F_but_tiny_use", "gas_use_no_gas_supply", "missing_usage", "short_history"):
        st.info("This fault needs a home with energy readings, so a dataset example home is used instead."); base_ = breakit._base(eng)
    rr = breakit.respond(eng, base_, kind)
    (st.success if rr["passed"] else st.error)("Handled as expected" if rr["passed"] else "NOT handled as expected")
    for fl_ in rr["flags"]: st.warning(fl_["message"])
    st.json(rr["observed"])
    if st.button("Run the full automated suite (50 cases)"):
        suite = breakit.run_suite(eng); st.metric("Fault cases handled as expected", f"{suite['pass_rate'] * 100:.0f}%"); st.caption(f"Clean homes wrongly flagged: {suite['clean_homes_flag_rate'] * 100:.1f}%. The faults and expectations were written by us, so this checks safe behaviour, not general robustness.")
        st.dataframe(pd.DataFrame({k: [f"{v * 100:.0f}%"] for k, v in suite["by_kind"].items()}).T.rename(columns={0: "pass"}))

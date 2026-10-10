"""Explainable Green Home Score: S = sum_k w_k * s_k, fixed weights, documented monotone sub-score maps (config.py).

Double-counting note: SAP (energy_efficiency) is the recorded rating only; intensity is METERED kWh/m2 only
(corr(SAP, metered intensity) is far weaker than with EPC modelled intensity - see reports); insulation/
heating/glazing/renewable/smart describe the *state* of each feature a homeowner can change. A feature may
influence several components physically, but no raw input column feeds two sub-scores.
Unknown inputs (NaN) are excluded and weights renormalised (result flagged `partial`), never treated as zero."""
import numpy as np
import pandas as pd
from . import config as C


def classify(score) -> str:
    s = int(round(score))
    for lo, name in C.CLASSES:
        if s >= lo:
            return name
    return "Very poor"


def _map(s: pd.Series, table: dict) -> pd.Series:
    return s.map(table).astype(float)


def sub_scores(df: pd.DataFrame) -> pd.DataFrame:
    s = pd.DataFrame(index=df.index)
    s["energy_efficiency"] = df.sap_score.clip(1, 100).astype(float)
    s["energy_intensity"] = np.interp(df.intensity.astype(float), C.INTENSITY_X, C.INTENSITY_Y)
    wall = _map(df.wall_insulation_level, C.WALL_LEVEL_SCORE)
    loft = pd.Series(np.interp(df.loft_mm.astype(float), C.LOFT_X, C.LOFT_Y), index=df.index).where(df.loft_mm.notna())
    roof = loft.fillna(_map(df.roof_insulation, C.ROOF_CAT_SCORE))
    roof = roof.where(~df.roof_type.astype(str).isin(C.ROOF_NA))                    # N/A roof excluded
    floor = _map(df.floor_insulation, C.FLOOR_SCORE)
    parts = pd.concat({"wall": wall, "roof": roof, "floor": floor}, axis=1)
    w = pd.DataFrame({k: parts[k].notna() * C.INS_W[k] for k in C.INS_W})
    s["insulation"] = parts.fillna(0).mul(pd.Series(C.INS_W), axis=1).sum(axis=1) / w.sum(axis=1).replace(0, np.nan)
    hk = df.heating_detail.astype(str).copy()
    gb = hk == "gas_boiler"
    hk[gb & (df.boiler_condensing == True)] = "gas_boiler_condensing"       # noqa: E712
    hk[gb & (df.boiler_condensing == False)] = "gas_boiler_noncondensing"   # noqa: E712
    hk[gb & df.boiler_condensing.isna()] = "gas_boiler_unknown"
    s["heating"] = hk.map(C.HEATING_SCORE).astype(float)
    s["glazing"] = _map(df.glazing_level, C.GLAZING_LEVEL_SCORE)
    kwp = df.solar_kwp_est.astype(float)
    s["renewable"] = np.interp(kwp, C.SOLAR_X, C.SOLAR_Y)
    s.loc[df.has_solar_pv.isna() & ~(kwp > 0), "renewable"] = np.nan          # unknown PV status != "no solar"
    s["smart"] = _map(df.controls_level, C.CONTROLS_SCORE)
    return s


def score_df(df: pd.DataFrame) -> pd.DataFrame:
    """Adds s_<k>, c_<k> (points contributed), score, classification, partial."""
    ss = sub_scores(df)
    w = pd.DataFrame({k: ss[k].notna() * C.WEIGHTS[k] for k in C.WEIGHTS})
    wn = w.div(w.sum(axis=1), axis=0)
    out = df.copy()
    total = 0
    for k in C.WEIGHTS:
        out[f"s_{k}"] = ss[k]
        out[f"c_{k}"] = (wn[k] * ss[k]).where(ss[k].notna())
    out["score"] = np.rint(sum((wn[k] * ss[k].fillna(0)) for k in C.WEIGHTS)).astype(int)
    out["classification"] = out.score.map(classify)
    out["score_partial"] = w.sum(axis=1) < 1 - 1e-9
    out["_wn"] = list(wn.values)
    return out


def green_score(p: dict) -> dict:
    """Single-home wrapper: components with sub_score/weight/contribution (points)."""
    r = score_df(pd.DataFrame([p])).iloc[0]
    comps = {}
    wn = dict(zip(C.WEIGHTS, r["_wn"]))
    for k in C.WEIGHTS:
        v = r[f"s_{k}"]
        comps[k] = ({"sub_score": round(float(v), 1), "weight": C.WEIGHTS[k], "contribution": round(float(r[f"c_{k}"]), 2),
                     "max_contribution": round(float(wn[k] * 100), 2)} if pd.notna(v)
                    else {"sub_score": None, "weight": C.WEIGHTS[k], "contribution": None, "max_contribution": None})
    known = {k: float(r[f"s_{k}"]) for k in C.WEIGHTS if pd.notna(r[f"s_{k}"])}
    low = sum(C.WEIGHTS[k] * v for k, v in known.items()); miss_w = sum(w for k, w in C.WEIGHTS.items() if k not in known)
    return {"score": int(r.score), "classification": r.classification, "components": comps, "partial": bool(r.score_partial),
            "n_known": len(known), "missing": [k for k in C.WEIGHTS if k not in known],
            "bounds": {"low": int(round(low)), "high": int(round(low + 100 * miss_w))}}


def key_issues(p: dict, sc: dict) -> list:
    """Components scoring < 40 -> plain-language issues, ordered by weighted gap."""
    txt = {
        "energy_efficiency": lambda: f"Low recorded energy rating ({p['energy_rating']}, SAP {p['sap_score']})",
        "energy_intensity": lambda: f"High energy use per m2 ({p.get('intensity') or 0:.0f} kWh/m2/yr)",
        "insulation": lambda: "Poor insulation (" + ", ".join(x for x in [
            "uninsulated walls" if p.get("wall_insulation_level") == 0 else "", "thin/no loft insulation" if (p.get("loft_mm") or 999) < 100 else "",
            "uninsulated floor" if p.get("floor_insulation") == "none" else ""] if x) + ")",
        "heating": lambda: f"Inefficient heating system ({str(p['heating_detail']).replace('_', ' ')})",
        "glazing": lambda: "Single/partial glazing", "renewable": lambda: "No renewable generation",
        "smart": lambda: "Basic or no heating controls"}
    gaps = sorted(((100 - c["sub_score"]) * C.WEIGHTS[k], k) for k, c in sc["components"].items()
                  if c["sub_score"] is not None and c["sub_score"] < 40)
    return [txt[k]() for _, k in reversed(gaps)]

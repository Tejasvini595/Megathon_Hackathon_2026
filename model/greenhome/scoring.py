"""Explainable Green Home Score: S = sum_k w_k * s_k, fixed weights, documented monotone sub-score maps (config.py).

Double-counting note: SAP (energy_efficiency) is the recorded rating only; intensity is METERED kWh/m2 only
(corr(SAP, metered intensity) is far weaker than with EPC modelled intensity - see reports); insulation/
heating/glazing/renewable/smart describe the *state* of each feature a homeowner can change. A feature may
influence several components physically, but no raw input column feeds two sub-scores.
Unknown inputs (NaN) are excluded and weights renormalised (result flagged `partial`), never treated as zero.

The maps are applied to plain numpy arrays (one implementation for a single home and for the whole dataset), so
scoring one home does not pay pandas' per-operation overhead."""
import numpy as np
import pandas as pd
from . import config as C

SCORE_COLS = ["sap_score", "intensity", "wall_insulation_level", "loft_mm", "roof_insulation", "roof_type", "floor_insulation",
              "heating_detail", "boiler_condensing", "glazing_level", "solar_kwp_est", "has_solar_pv", "controls_level"]
_KEYS = list(C.WEIGHTS)
_W = np.array([C.WEIGHTS[k] for k in _KEYS])


def classify(score) -> str:
    s = int(round(score))
    for lo, name in C.CLASSES:
        if s >= lo:
            return name
    return "Very poor"


def _cols(data) -> dict:
    """Score inputs as 1-D arrays: a DataFrame's columns, or one home (dict) as length-1 object arrays."""
    if isinstance(data, pd.DataFrame):
        return {c: data[c].to_numpy() for c in SCORE_COLS}
    return {c: np.array([data[c]], dtype=object) for c in SCORE_COLS}


def _num(a):
    return np.asarray(pd.to_numeric(pd.Series(a, dtype=object), errors="coerce"), float) if a.dtype == object else a.astype(float)


def _map(a, table: dict):
    return np.array([table.get(v, np.nan) if not pd.isna(v) else np.nan for v in a], float)


def _parts(c: dict):
    """Insulation part scores (walls, roof, floor); NaN = unknown or not applicable."""
    wall = _map(c["wall_insulation_level"], C.WALL_LEVEL_SCORE)
    loft_mm = _num(c["loft_mm"])
    loft = np.where(np.isnan(loft_mm), np.nan, np.interp(loft_mm, C.LOFT_X, C.LOFT_Y))
    roof = np.where(np.isnan(loft), _map(c["roof_insulation"], C.ROOF_CAT_SCORE), loft)
    roof = np.where(np.isin(np.array([str(v) for v in c["roof_type"]], dtype=object), list(C.ROOF_NA)), np.nan, roof)   # N/A roof excluded
    floor = _map(c["floor_insulation"], C.FLOOR_SCORE)
    return wall, roof, floor


def _sub_scores(c: dict) -> np.ndarray:
    """(n, 7) sub-scores in WEIGHTS order; NaN = unknown."""
    n = len(c["sap_score"])
    s = np.empty((n, len(_KEYS)))
    s[:, 0] = np.clip(_num(c["sap_score"]), 1, 100)
    s[:, 1] = np.interp(_num(c["intensity"]), C.INTENSITY_X, C.INTENSITY_Y)
    wall, roof, floor = _parts(c)
    num = np.zeros(n); den = np.zeros(n)
    for part, w in ((wall, C.INS_W["wall"]), (roof, C.INS_W["roof"]), (floor, C.INS_W["floor"])):
        num = num + np.where(np.isnan(part), 0.0, part) * w
        den = den + (~np.isnan(part)) * w
    s[:, 2] = num / np.where(den == 0, np.nan, den)
    hk = np.array([str(v) for v in c["heating_detail"]], dtype=object)
    bc = c["boiler_condensing"]
    gb = hk == "gas_boiler"
    hk[gb & np.array([v == True for v in bc], bool)] = "gas_boiler_condensing"        # noqa: E712
    hk[gb & np.array([v == False for v in bc], bool)] = "gas_boiler_noncondensing"    # noqa: E712
    hk[gb & np.array([pd.isna(v) for v in bc], bool)] = "gas_boiler_unknown"
    s[:, 3] = _map(hk, C.HEATING_SCORE)
    s[:, 4] = _map(c["glazing_level"], C.GLAZING_LEVEL_SCORE)
    kwp = _num(c["solar_kwp_est"])
    ren = np.interp(kwp, C.SOLAR_X, C.SOLAR_Y)
    with np.errstate(invalid="ignore"):
        ren[np.array([pd.isna(v) for v in c["has_solar_pv"]], bool) & ~(kwp > 0)] = np.nan   # unknown PV status != "no solar"
    s[:, 5] = ren
    s[:, 6] = _map(c["controls_level"], C.CONTROLS_SCORE)
    return s


def element_scores(p: dict) -> dict:
    """One home's insulation state per part (0-100, None when it doesn't apply), for the thermal view."""
    c = _cols(p); wall, roof, floor = _parts(c); glazing = _map(c["glazing_level"], C.GLAZING_LEVEL_SCORE)
    v = lambda a: None if np.isnan(a[0]) else round(float(a[0]), 1)
    return {"walls": v(wall), "roof": v(roof), "floor": v(floor), "windows": v(glazing)}


def insulation_score(p: dict) -> float:
    """The insulation sub-score of one home (NaN when no part is known)."""
    return _sub_scores(_cols(p))[0, 2]


def sub_scores(df: pd.DataFrame) -> pd.DataFrame:
    return pd.DataFrame(_sub_scores(_cols(df)), index=df.index, columns=["energy_efficiency", "energy_intensity", "insulation", "heating", "glazing", "renewable", "smart"])


def _combine(ss: np.ndarray):
    """-> normalised weights, points per component (NaN when unknown), score (int), partial flag."""
    known = ~np.isnan(ss)
    w = known * _W
    wsum = w.sum(axis=1)
    wn = w / wsum[:, None]
    total = 0
    for j in range(len(_KEYS)):
        total = total + wn[:, j] * np.where(known[:, j], ss[:, j], 0.0)
    return wn, np.where(known, wn * ss, np.nan), np.rint(total).astype(int), wsum < 1 - 1e-9


def score_df(df: pd.DataFrame) -> pd.DataFrame:
    """Adds s_<k>, c_<k> (points contributed), score, classification, partial."""
    ss = _sub_scores(_cols(df))
    wn, pts, score, partial = _combine(ss)
    new = {}
    for j, k in enumerate(_KEYS):
        new[f"s_{k}"] = ss[:, j]
        new[f"c_{k}"] = pts[:, j]
    new["score"] = score
    new["classification"] = [classify(v) for v in score]
    new["score_partial"] = partial
    new["_wn"] = list(wn)
    out = df.copy()
    for k, v in new.items():
        out[k] = v
    return out


def green_score(p: dict) -> dict:
    """Single-home wrapper: components with sub_score/weight/contribution (points)."""
    ss = _sub_scores(_cols(p))
    wn_, pts_, score_, partial_ = _combine(ss)
    s, wn, pts = ss[0], wn_[0], pts_[0]
    comps = {}
    for j, k in enumerate(_KEYS):
        v = s[j]
        comps[k] = ({"sub_score": round(float(v), 1), "weight": C.WEIGHTS[k], "contribution": round(float(pts[j]), 2),
                     "max_contribution": round(float(wn[j] * 100), 2)} if not np.isnan(v)
                    else {"sub_score": None, "weight": C.WEIGHTS[k], "contribution": None, "max_contribution": None})
    known = {k: float(s[j]) for j, k in enumerate(_KEYS) if not np.isnan(s[j])}
    low = sum(C.WEIGHTS[k] * v for k, v in known.items()); miss_w = sum(w for k, w in C.WEIGHTS.items() if k not in known)
    return {"score": int(score_[0]), "classification": classify(score_[0]), "components": comps, "partial": bool(partial_[0]),
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

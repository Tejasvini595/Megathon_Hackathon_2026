"""Fetch lat/long + admin geography for every postcode in the EPC extract from postcodes.io (OGL data).

Run once; output is cached in raw/postcodes/postcodes.csv so the build is offline afterwards.
Terminated postcodes fall back to /terminated_postcodes, then to the outcode centroid.
"""
import csv, json, sys, time, concurrent.futures as cf
from pathlib import Path
import requests

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "raw/postcodes/postcodes.csv"
FIELDS = ["postcode", "lat", "lon", "outcode", "lsoa", "msoa", "admin_ward", "admin_district",
          "parliamentary_constituency", "region", "country", "geo_source"]


def epc_postcodes():
    pcs = set()
    with open(ROOT / "raw/epc/batch2/certificates.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r["postcode"]:
                pcs.add(r["postcode"].strip().upper())
    return sorted(pcs)


def bulk(chunk, s):
    for attempt in range(5):
        try:
            r = s.post("https://api.postcodes.io/postcodes", json={"postcodes": chunk}, timeout=30)
            r.raise_for_status()
            return r.json()["result"]
        except Exception:
            time.sleep(2 ** attempt)
    raise RuntimeError("postcodes.io failed")


def row(pc, res, src):
    return {"postcode": pc, "lat": res.get("latitude"), "lon": res.get("longitude"),
            "outcode": res.get("outcode") or pc.split()[0], "lsoa": res.get("lsoa"), "msoa": res.get("msoa"),
            "admin_ward": res.get("admin_ward"), "admin_district": res.get("admin_district"),
            "parliamentary_constituency": res.get("parliamentary_constituency"),
            "region": res.get("region"), "country": res.get("country"), "geo_source": src}


def main():
    pcs = epc_postcodes()
    print(len(pcs), "postcodes", file=sys.stderr)
    s = requests.Session()
    chunks = [pcs[i:i + 100] for i in range(0, len(pcs), 100)]
    rows, missing = [], []
    with cf.ThreadPoolExecutor(6) as ex:
        for res in ex.map(lambda c: bulk(c, s), chunks):
            for item in res:
                if item["result"]:
                    rows.append(row(item["query"], item["result"], "postcodes.io"))
                else:
                    missing.append(item["query"])
    print(len(missing), "not live; trying terminated/outcode", file=sys.stderr)
    oc_cache = {}
    for pc in missing:
        r = s.get(f"https://api.postcodes.io/terminated_postcodes/{pc}", timeout=30)
        if r.ok and r.json().get("result", {}).get("latitude"):
            rows.append(row(pc, r.json()["result"], "postcodes.io terminated"))
            continue
        oc = pc.split()[0]
        if oc not in oc_cache:
            r2 = s.get(f"https://api.postcodes.io/outcodes/{oc}", timeout=30)
            oc_cache[oc] = r2.json().get("result") if r2.ok else None
        res = oc_cache[oc] or {}
        rows.append({**row(pc, res, "outcode centroid"), "outcode": oc,
                     "admin_district": (res.get("admin_district") or [None])[0] if res else None})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", newline="") as f:
        w = csv.DictWriter(f, FIELDS)
        w.writeheader()
        w.writerows(sorted(rows, key=lambda r: r["postcode"]))
    print("wrote", len(rows), file=sys.stderr)


if __name__ == "__main__":
    main()

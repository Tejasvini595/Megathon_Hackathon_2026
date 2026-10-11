import type { PropertyRecord } from "@/lib/extract/fields";
import type { BuiltForm, Geometry, RoofShape } from "./types";

/** The picked OSM building's oriented outline (`Home.footprint.measure`). */
export type FootprintSize = { widthM: number; depthM: number; bearingDeg: number };

export function footprintSize(footprint: unknown): FootprintSize | undefined {
  const m = (footprint as { measure?: Partial<FootprintSize> } | null)?.measure;
  return m && typeof m.widthM === "number" && typeof m.depthM === "number" && typeof m.bearingDeg === "number" ? (m as FootprintSize) : undefined;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Geometry for the 3D house from a confirmed record, sized and oriented by the real map outline when
 * the user picked one. Purely visual: no engine numbers come from here.
 */
export function geometryFromRecord(r: Partial<PropertyRecord>, fp?: FootprintSize): Geometry {
  const type = String(r.propertyType ?? "house");
  const isFlat = type === "flat" || type === "maisonette" || r.builtForm === "flat";
  const builtForm = (isFlat ? "flat" : (r.builtForm as BuiltForm) ?? "semi") as BuiltForm;
  const storeys = type === "bungalow" ? 1 : Number(r.storeys ?? (type === "maisonette" ? 2 : isFlat ? 1 : 2));
  const blockStoreys = Math.max(storeys + (r.flatLevel === "mid" ? 2 : 1), Number(r.blockStoreys ?? 4));
  const floorIndex = r.flatLevel === "ground" ? 0 : r.flatLevel === "top" ? blockStoreys - storeys : Math.max(1, Math.floor((blockStoreys - storeys) / 2));
  const isTopFloor = isFlat && r.flatLevel === "top";
  const area = Number(r.floorAreaM2 ?? 85);
  const footprint = area / Math.max(1, storeys);
  let depth = Math.max(6, Math.min(11, Math.sqrt(footprint) * 1.05));
  let width = Math.max(4.5, Math.min(13, footprint / depth));
  let xBearingDeg: number | undefined;
  if (fp) {
    // Attached homes share their long walls, so the frontage (model x) is the short side.
    const attached = builtForm === "semi" || builtForm === "end_terrace" || builtForm === "mid_terrace";
    const long = Math.max(fp.widthM, fp.depthM);
    const short = Math.min(fp.widthM, fp.depthM);
    width = clamp(attached ? short : long, 4, 16);
    depth = clamp(attached ? long : short, 4, 14);
    xBearingDeg = (fp.bearingDeg - (attached ? 90 : 0) + 360) % 360;
  }
  const roof: RoofShape = r.roofType === "hip" ? "hip" : r.roofType === "flat" ? "flat" : "gable";
  return {
    builtForm,
    storeys,
    roof,
    windowsPerFloor: width > 8 ? 4 : width > 5.5 ? 3 : 2,
    width: Number(width.toFixed(1)),
    depth: Number(depth.toFixed(1)),
    hasSolar: r.solarPv === "yes",
    ...(r.solarPv === "yes" && r.solarKw != null && { solarKw: Number(r.solarKw) }),
    hasHeatPump: String(r.heating).startsWith("heat_pump"),
    chimney: !isFlat && ["pre1900", "1900_1929", "1930_1949", "1950_1966"].includes(String(r.ageBand)),
    isTopFloor,
    ...(isFlat && { blockStoreys, floorIndex }),
    ...(xBearingDeg !== undefined && { xBearingDeg }),
  };
}

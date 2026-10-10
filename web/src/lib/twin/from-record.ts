import type { PropertyRecord } from "@/lib/extract/fields";
import type { BuiltForm, Geometry, RoofShape } from "./types";

/** Geometry for the 3D house from a confirmed record. Purely visual: no engine numbers come from here. */
export function geometryFromRecord(r: Partial<PropertyRecord>): Geometry {
  const type = String(r.propertyType ?? "house");
  const isFlat = type === "flat" || type === "maisonette" || r.builtForm === "flat";
  const builtForm = (isFlat ? "flat" : (r.builtForm as BuiltForm) ?? "semi") as BuiltForm;
  const storeys = isFlat ? 1 : Number(r.storeys ?? (type === "bungalow" ? 1 : 2));
  const isTopFloor = isFlat && r.roofType !== "dwelling_above";
  const area = Number(r.floorAreaM2 ?? 85);
  const footprint = area / Math.max(1, storeys);
  const depth = Math.max(6, Math.min(11, Math.sqrt(footprint) * 1.05));
  const width = Math.max(4.5, Math.min(13, footprint / depth));
  const roof: RoofShape = r.roofType === "hip" ? "hip" : r.roofType === "flat" ? "flat" : "gable";
  return {
    builtForm,
    storeys,
    roof,
    windowsPerFloor: width > 8 ? 4 : width > 5.5 ? 3 : 2,
    width: Number(width.toFixed(1)),
    depth: Number(depth.toFixed(1)),
    hasSolar: r.solarPv === "yes",
    hasHeatPump: r.heating === "heat_pump",
    chimney: !isFlat && ["pre1900", "1900_1929", "1930_1949", "1950_1966"].includes(String(r.ageBand)),
    isTopFloor,
  };
}

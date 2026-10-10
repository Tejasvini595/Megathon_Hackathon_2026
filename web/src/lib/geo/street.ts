import { centroid, inferFromFootprint, measure, project, type Inference, type Measure } from "./footprint";
import { buildingsNear } from "./osm";
import { findPostcode, normalisePostcode } from "./postcode";
import type { Origin, Xz } from "./types";

export type StreetBuilding = {
  osmId: number;
  outline: Xz[];
  centre: Xz;
  measure: Measure;
  suggestions: Inference;
  label?: string;
};

export type StreetResult =
  | { ok: false; error: string }
  | {
      ok: true;
      postcode: string;
      district: string | null;
      region: string | null;
      origin: Origin;
      attribution: string;
      buildings: StreetBuilding[];
    };

const round1 = (n: number) => Math.round(n * 10) / 10;
const roundXz = ([x, z]: Xz): Xz => [round1(x), round1(z)];

/** Buildings around a postcode in local metres, each with what its footprint suggests about the home. */
export async function describeStreet(postcode: string): Promise<StreetResult> {
  const pc = normalisePostcode(postcode);
  const street = await buildingsNear(pc).catch((e: unknown) => {
    console.error("Street lookup failed", e);
    return new Error("We couldn't load the map right now. You can carry on with just the postcode.");
  });
  if (street instanceof Error) return { ok: false, error: street.message };
  if (!street) return { ok: false, error: "We don't recognise that postcode." };

  const footprints = street.buildings.map((b) => project(b.polygon, street.origin));
  const row = await findPostcode(pc);

  const buildings = street.buildings.map((b, i): StreetBuilding => {
    const others = footprints.filter((_, j) => j !== i);
    const label = [b.tags.houseNumber, b.tags.street].filter(Boolean).join(" ") || b.tags.name;
    const m = measure(footprints[i]);
    return {
      osmId: b.osmId,
      outline: footprints[i].map(roundXz),
      centre: roundXz(centroid(footprints[i])),
      measure: { widthM: round1(m.widthM), depthM: round1(m.depthM), bearingDeg: Math.round(m.bearingDeg), areaM2: Math.round(m.areaM2) },
      suggestions: inferFromFootprint(footprints[i], others, b.tags),
      label: label || undefined,
    };
  });

  return {
    ok: true,
    postcode: pc,
    district: row?.district ?? null,
    region: row?.region ?? null,
    origin: street.origin,
    attribution: street.attribution,
    buildings,
  };
}

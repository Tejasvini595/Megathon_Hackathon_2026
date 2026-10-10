import type { BuildingTags, LonLat, Origin, Xz } from "./types";

const EARTH_RADIUS_M = 6_371_000;
const WALL_TOLERANCE_M = 0.6;
const WALL_MIN_OVERLAP_M = 2;
const WALL_MAX_ANGLE_RAD = (5 * Math.PI) / 180;

export type Measure = { widthM: number; depthM: number; bearingDeg: number; areaM2: number };
export type Suggestion<T> = { value: T; confidence: number; evidence: string };
export type Inference = {
  propertyType?: Suggestion<"house" | "bungalow" | "flat">;
  builtForm?: Suggestion<"detached" | "semi" | "end_terrace" | "mid_terrace" | "flat">;
  storeys?: Suggestion<number>;
  floorAreaM2?: Suggestion<number>;
  roofType?: Suggestion<"gable" | "hip" | "flat">;
};

export function project(polygon: LonLat[], origin: Origin): Xz[] {
  const k = Math.PI / 180;
  const cos = Math.cos(origin.lat * k);
  const pts = polygon.map(([lon, lat]): Xz => [
    (lon - origin.lon) * k * EARTH_RADIUS_M * cos,
    -(lat - origin.lat) * k * EARTH_RADIUS_M,
  ]);
  const first = pts[0];
  const last = pts[pts.length - 1];
  return pts.length > 1 && first[0] === last[0] && first[1] === last[1] ? pts.slice(0, -1) : pts;
}

export function area(polygon: Xz[]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x1, z1] = polygon[i];
    const [x2, z2] = polygon[(i + 1) % polygon.length];
    sum += x1 * z2 - x2 * z1;
  }
  return Math.abs(sum) / 2;
}

export function centroid(polygon: Xz[]): Xz {
  const n = polygon.length;
  return [polygon.reduce((s, p) => s + p[0], 0) / n, polygon.reduce((s, p) => s + p[1], 0) / n];
}

function convexHull(points: Xz[]): Xz[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: Xz, a: Xz, b: Xz) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const build = (input: Xz[]) => {
    const half: Xz[] = [];
    for (const p of input) {
      while (half.length >= 2 && cross(half[half.length - 2], half[half.length - 1], p) <= 0) half.pop();
      half.push(p);
    }
    half.pop();
    return half;
  };
  return [...build(pts), ...build([...pts].reverse())];
}

/** Minimum-area oriented bounding rectangle. Bearing is the long side's compass bearing, 0 to 180. */
export function measure(polygon: Xz[]): Measure {
  const hull = convexHull(polygon);
  let best = { size: Infinity, w: 0, d: 0, angle: 0 };
  for (let i = 0; i < hull.length; i++) {
    const [x1, z1] = hull[i];
    const [x2, z2] = hull[(i + 1) % hull.length];
    const angle = Math.atan2(z2 - z1, x2 - x1);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const [x, z] of hull) {
      const u = x * c + z * s;
      const v = -x * s + z * c;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const size = (maxU - minU) * (maxV - minV);
    if (size < best.size) best = { size, w: maxU - minU, d: maxV - minV, angle };
  }
  const longIsU = best.w >= best.d;
  const longAngle = longIsU ? best.angle : best.angle + Math.PI / 2;
  const bearing = ((Math.atan2(Math.cos(longAngle), -Math.sin(longAngle)) * 180) / Math.PI + 360) % 180;
  return {
    widthM: Math.max(best.w, best.d),
    depthM: Math.min(best.w, best.d),
    bearingDeg: bearing,
    areaM2: area(polygon),
  };
}

function edges(polygon: Xz[]): [Xz, Xz][] {
  return polygon.map((p, i) => [p, polygon[(i + 1) % polygon.length]]);
}

function edgesShareWall([a1, a2]: [Xz, Xz], [b1, b2]: [Xz, Xz]): boolean {
  const dx = a2[0] - a1[0];
  const dz = a2[1] - a1[1];
  const len = Math.hypot(dx, dz);
  const blen = Math.hypot(b2[0] - b1[0], b2[1] - b1[1]);
  if (len < WALL_MIN_OVERLAP_M || blen < WALL_MIN_OVERLAP_M) return false;
  const ux = dx / len;
  const uz = dz / len;
  const sinAngle = Math.abs(ux * (b2[1] - b1[1]) - uz * (b2[0] - b1[0])) / blen;
  const cosAngle = Math.abs(ux * (b2[0] - b1[0]) + uz * (b2[1] - b1[1])) / blen;
  if (Math.atan2(sinAngle, cosAngle) > WALL_MAX_ANGLE_RAD) return false;
  const along = (p: Xz) => (p[0] - a1[0]) * ux + (p[1] - a1[1]) * uz;
  const across = (p: Xz) => Math.abs(-(p[0] - a1[0]) * uz + (p[1] - a1[1]) * ux);
  if (across(b1) > WALL_TOLERANCE_M || across(b2) > WALL_TOLERANCE_M) return false;
  const lo = Math.max(0, Math.min(along(b1), along(b2)));
  const hi = Math.min(len, Math.max(along(b1), along(b2)));
  return hi - lo >= WALL_MIN_OVERLAP_M;
}

function sharesWall(a: Xz[], b: Xz[]): boolean {
  const bEdges = edges(b);
  return edges(a).some((ea) => bEdges.some((eb) => edgesShareWall(ea, eb)));
}

/** Number of distinct neighbours with a wall in common with the target. */
export function sharedWalls(target: Xz[], neighbours: Xz[][]): number {
  return neighbours.filter((n) => n !== target && sharesWall(target, n)).length;
}

const FLAT_TYPES = new Set(["apartments", "flats"]);
// OSM `building=` values that say what kind of home it is ("yes" and "residential" don't).
const HOME_TYPES: Record<string, { value: "house" | "bungalow" | "flat"; confidence: number }> = {
  house: { value: "house", confidence: 0.7 },
  detached: { value: "house", confidence: 0.75 },
  semidetached_house: { value: "house", confidence: 0.75 },
  terrace: { value: "house", confidence: 0.75 },
  bungalow: { value: "bungalow", confidence: 0.85 },
  apartments: { value: "flat", confidence: 0.75 },
  flats: { value: "flat", confidence: 0.75 },
};
const ROOF_SHAPES = { gabled: "gable", hipped: "hip", flat: "flat" } as const;

function plural(n: number, noun: string) {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

export function inferFromFootprint(target: Xz[], neighbours: Xz[][], tags: BuildingTags): Inference {
  const out: Inference = {};
  const kind = tags.building ? HOME_TYPES[tags.building] : undefined;
  if (kind) out.propertyType = { ...kind, evidence: `Tagged "${tags.building}" on the map` };
  const touching = neighbours.filter((n) => n !== target && sharesWall(target, n));

  if (tags.building && FLAT_TYPES.has(tags.building)) {
    out.builtForm = { value: "flat", confidence: 0.75, evidence: "Tagged as a block of flats on the map" };
  } else if (touching.length === 0) {
    out.builtForm = { value: "detached", confidence: 0.8, evidence: "Shares no walls with neighbours on the map" };
  } else if (touching.length === 1) {
    const others = neighbours.filter((n) => n !== target && n !== touching[0]);
    const continues = others.some((n) => sharesWall(touching[0], n));
    out.builtForm = continues
      ? { value: "end_terrace", confidence: 0.75, evidence: "Shares one wall, and that neighbour is part of a longer row" }
      : { value: "semi", confidence: 0.8, evidence: "Shares a wall with 1 neighbour on the map" };
  } else {
    out.builtForm = {
      value: "mid_terrace",
      confidence: 0.8,
      evidence: `Shares walls with ${plural(touching.length, "neighbour")} on the map`,
    };
  }

  const levels = tags.levels ? Math.min(4, Math.max(1, Math.round(tags.levels))) : undefined;
  if (levels) {
    out.storeys = { value: levels, confidence: 0.9, evidence: `Map lists ${plural(levels, "storey")}` };
    out.floorAreaM2 = {
      value: Math.round(area(target) * levels),
      confidence: 0.55,
      evidence: `Footprint of ${Math.round(area(target))} m² across ${plural(levels, "storey")}`,
    };
  }

  const roof = tags.roofShape ? ROOF_SHAPES[tags.roofShape as keyof typeof ROOF_SHAPES] : undefined;
  if (roof) out.roofType = { value: roof, confidence: 0.85, evidence: `Map lists a ${tags.roofShape} roof` };

  return out;
}

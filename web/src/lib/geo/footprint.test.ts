import { describe, expect, test } from "bun:test";
import { inferFromFootprint, measure, project, sharedWalls } from "./footprint";
import type { Xz } from "./types";

const rect = (x: number, z: number, w: number, d: number, deg = 0): Xz[] => {
  const a = (deg * Math.PI) / 180;
  const pts: Xz[] = [[0, 0], [w, 0], [w, d], [0, d]];
  return pts.map(([px, pz]) => [x + px * Math.cos(a) - pz * Math.sin(a), z + px * Math.sin(a) + pz * Math.cos(a)]);
};

describe("measure", () => {
  test("plain rectangle", () => {
    const m = measure(rect(0, 0, 10, 6));
    expect(m.widthM).toBeCloseTo(10);
    expect(m.depthM).toBeCloseTo(6);
    expect(m.areaM2).toBeCloseTo(60);
    expect(m.bearingDeg).toBeCloseTo(90);
  });

  test("rotated 30 degrees keeps size", () => {
    const m = measure(rect(5, 5, 10, 6, 30));
    expect(m.widthM).toBeCloseTo(10);
    expect(m.depthM).toBeCloseTo(6);
    expect(m.areaM2).toBeCloseTo(60);
    expect(m.bearingDeg).toBeCloseTo(120);
  });
});

describe("project", () => {
  test("north is negative z and closing point is dropped", () => {
    const ring: [number, number][] = [[-1.9, 52.5], [-1.9, 52.5009], [-1.8999, 52.5009], [-1.9, 52.5]];
    const pts = project(ring, { lat: 52.5, lon: -1.9 });
    expect(pts).toHaveLength(3);
    expect(pts[1][1]).toBeCloseTo(-100, 0);
  });
});

describe("shared walls", () => {
  const a = rect(0, 0, 6, 9);
  const b = rect(6, 0, 6, 9);
  const c = rect(12, 0, 6, 9);
  const far = rect(40, 0, 6, 9);

  test("detached shares nothing", () => {
    expect(sharedWalls(a, [far, rect(0, 20, 6, 9)])).toBe(0);
    expect(inferFromFootprint(a, [far], {}).builtForm?.value).toBe("detached");
  });

  test("semi pair", () => {
    expect(sharedWalls(a, [b, far])).toBe(1);
    expect(inferFromFootprint(a, [b, far], {}).builtForm?.value).toBe("semi");
  });

  test("terrace row", () => {
    expect(inferFromFootprint(b, [a, c], {}).builtForm?.value).toBe("mid_terrace");
    expect(inferFromFootprint(a, [b, c], {}).builtForm?.value).toBe("end_terrace");
    expect(inferFromFootprint(b, [a, c], {}).builtForm?.evidence).toBe("Shares walls with 2 neighbours on the map");
  });

  test("tolerates a small gap and rejects corner contact", () => {
    expect(sharedWalls(a, [rect(6.4, 0, 6, 9)])).toBe(1);
    expect(sharedWalls(a, [rect(6, 8, 6, 9)])).toBe(0);
    expect(sharedWalls(a, [rect(7.5, 0, 6, 9)])).toBe(0);
  });

  test("rotated terrace", () => {
    const r1 = rect(3, 3, 6, 9, 30);
    const r2 = rect(3 + 6 * Math.cos(Math.PI / 6), 3 + 6 * Math.sin(Math.PI / 6), 6, 9, 30);
    expect(sharedWalls(r1, [r2])).toBe(1);
  });
});

describe("tags", () => {
  const a = rect(0, 0, 6, 9);
  test("levels, roof and flats", () => {
    const r = inferFromFootprint(a, [], { levels: 2, roofShape: "hipped" });
    expect(r.storeys?.value).toBe(2);
    expect(r.floorAreaM2?.value).toBe(108);
    expect(r.roofType?.value).toBe("hip");
    expect(inferFromFootprint(a, [], { building: "apartments" }).builtForm?.value).toBe("flat");
    expect(inferFromFootprint(a, [], {}).floorAreaM2).toBeUndefined();
  });
});

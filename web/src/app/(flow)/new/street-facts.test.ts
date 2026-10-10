import { describe, expect, test } from "bun:test";
import type { StreetBuilding } from "@/lib/geo/street";
import { describeForPrefill, runsAxis } from "./street-facts";

const home = {
  osmId: 1,
  outline: [],
  centre: [0, 0],
  measure: { widthM: 10.6, depthM: 4.6, bearingDeg: 40, areaM2: 49 },
  suggestions: {
    builtForm: { value: "mid_terrace", confidence: 0.8, evidence: "" },
    storeys: { value: 2, confidence: 0.9, evidence: "" },
  },
  tags: { building: "house", roofShape: "gabled" },
} as StreetBuilding;

describe("describeForPrefill", () => {
  test("uses only what the map provides", () => {
    expect(describeForPrefill(home, "120 Heald Grove")).toBe(
      "Mid-terrace house, 2 storeys (OSM), pitched roof, footprint about 49 m² (10.6 × 4.6 m), 120 Heald Grove.",
    );
    expect(describeForPrefill({ ...home, suggestions: {}, tags: {} }, "")).toBe("Footprint about 49 m² (10.6 × 4.6 m).");
  });

  test("names the long-side axis", () => {
    expect([0, 40, 90, 140, 179].map(runsAxis)).toEqual(["N–S", "NE–SW", "E–W", "NW–SE", "N–S"]);
  });
});

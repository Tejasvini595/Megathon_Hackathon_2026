import { describe, expect, test } from "bun:test";
import { groundDirection, sunDirection, sunPosition } from "./sun";

describe("sunPosition", () => {
  test("London midsummer noon is due south and about 62° up", () => {
    const p = sunPosition(51.5, 172, 12);
    expect(p.azimuthDeg).toBeCloseTo(180, 0);
    expect(p.elevationDeg).toBeGreaterThan(60);
    expect(p.elevationDeg).toBeLessThan(63);
  });

  test("winter noon is low, and mornings are in the east", () => {
    expect(sunPosition(51.5, 355, 12).elevationDeg).toBeLessThan(16);
    const morning = sunPosition(51.5, 80, 8);
    expect(morning.azimuthDeg).toBeGreaterThan(90);
    expect(morning.azimuthDeg).toBeLessThan(180);
  });

  test("the sun is below the horizon at midnight", () => {
    expect(sunPosition(53, 80, 0).elevationDeg).toBeLessThan(0);
  });
});

describe("model-space directions", () => {
  test("with +x pointing east, south is +z and north is -z", () => {
    const [x, z] = groundDirection(180, 90);
    expect(x).toBeCloseTo(0);
    expect(z).toBeCloseTo(1);
    expect(groundDirection(0, 90)[1]).toBeCloseTo(-1);
  });

  test("a high southern sun points mostly up and toward +z", () => {
    const [x, y, z] = sunDirection({ azimuthDeg: 180, elevationDeg: 60 }, 90);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(Math.sin(Math.PI / 3));
    expect(z).toBeGreaterThan(0);
  });
});

/**
 * Approximate sun position (NOAA-style declination and hour angle, solar time) for the sun-path view.
 * Visual only: it places the light and the shadow; no energy figure is derived from it.
 */

const RAD = Math.PI / 180;

export type SunPosition = { azimuthDeg: number; elevationDeg: number };

export function dayOfYear(date: Date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  return Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start) / 86_400_000);
}

/** Azimuth clockwise from north, elevation above the horizon, at `hour` local solar time. */
export function sunPosition(latDeg: number, day: number, hour: number): SunPosition {
  const decl = 23.44 * RAD * Math.sin(((2 * Math.PI) / 365) * (284 + day));
  const lat = latDeg * RAD;
  const h = (hour - 12) * 15 * RAD;
  const sinEl = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(h);
  const az = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) + Math.PI;
  return { azimuthDeg: ((az / RAD) % 360 + 360) % 360, elevationDeg: Math.asin(sinEl) / RAD };
}

/**
 * Unit vector toward the sun in model space. The model's +x axis points along compass bearing
 * `xBearingDeg`, +y is up, and +z is 90° clockwise from +x (seen from above).
 */
export function sunDirection({ azimuthDeg, elevationDeg }: SunPosition, xBearingDeg: number): [number, number, number] {
  const phi = (azimuthDeg - xBearingDeg) * RAD;
  const el = elevationDeg * RAD;
  return [Math.cos(el) * Math.cos(phi), Math.sin(el), Math.cos(el) * Math.sin(phi)];
}

/** Model-space direction of compass bearing `deg` on the ground. */
export function groundDirection(deg: number, xBearingDeg: number): [number, number] {
  const phi = (deg - xBearingDeg) * RAD;
  return [Math.cos(phi), Math.sin(phi)];
}

export const SEASONS = [
  { id: "winter", label: "Winter", day: 355 },
  { id: "equinox", label: "Spring", day: 80 },
  { id: "summer", label: "Summer", day: 172 },
] as const;

import { prisma } from "@/lib/prisma";
import { findPostcode } from "./postcode";
import type { Building, BuildingTags, Origin } from "./types";

const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const USER_AGENT = "GreenHomeTwin/0.1 (hackathon prototype; street footprints for home energy estimates)";
const FRESH_MS = 30 * 24 * 60 * 60 * 1000;
const RADIUS_M = 150;
const TIMEOUT_MS = 20_000;
export const ATTRIBUTION = "© OpenStreetMap contributors";

const NON_RESIDENTIAL = new Set([
  "garage", "garages", "shed", "carport", "service", "roof", "hut", "cabin", "greenhouse", "barn", "farm_auxiliary",
  "commercial", "industrial", "retail", "warehouse", "office", "supermarket", "kiosk", "church", "chapel",
  "cathedral", "mosque", "synagogue", "temple", "school", "university", "college", "kindergarten", "hospital",
  "public", "civic", "government", "train_station", "transportation", "hotel", "parking", "stable", "construction",
]);

type OverpassWay = {
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
};

export type StreetBuildings = { origin: Origin; buildings: Building[]; attribution: typeof ATTRIBUTION };

function toBuilding(way: OverpassWay): Building | null {
  const t = way.tags ?? {};
  if (!way.geometry || way.geometry.length < 4 || (t.building && NON_RESIDENTIAL.has(t.building))) return null;
  const levels = parseFloat(t["building:levels"]);
  const tags: BuildingTags = {
    building: t.building,
    levels: Number.isFinite(levels) ? levels : undefined,
    roofShape: t["roof:shape"],
    houseNumber: t["addr:housenumber"],
    street: t["addr:street"],
    name: t.name,
  };
  return { osmId: way.id, polygon: way.geometry.map((p) => [p.lon, p.lat]), tags };
}

async function fetchOverpass(origin: Origin): Promise<Building[]> {
  const query = `[out:json][timeout:20];way["building"](around:${RADIUS_M},${origin.lat},${origin.lon});out geom tags;`;
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { elements: OverpassWay[] };
      return json.elements.map(toBuilding).filter((b): b is Building => b !== null);
    } catch {
      continue;
    }
  }
  throw new Error("We couldn't reach the map service just now. Please try again in a moment.");
}

export async function buildingsNear(postcode: string): Promise<StreetBuildings | null> {
  const row = await findPostcode(postcode);
  if (!row) return null;
  const origin = { lat: row.lat, lon: row.lon };

  const cached = await prisma.buildingCache.findUnique({ where: { postcode: row.postcode } });
  if (cached && Date.now() - cached.fetchedAt.getTime() < FRESH_MS) {
    return { origin, buildings: cached.buildings as Building[], attribution: ATTRIBUTION };
  }

  const buildings = await fetchOverpass(origin);
  const data = { buildings: buildings as unknown as object, fetchedAt: new Date() };
  await prisma.buildingCache.upsert({ where: { postcode: row.postcode }, create: { postcode: row.postcode, ...data }, update: data });
  return { origin, buildings, attribution: ATTRIBUTION };
}

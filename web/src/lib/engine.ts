import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { normaliseRecord } from "@/lib/extract";
import type { PropertyRecord } from "@/lib/extract/fields";
import { findPostcode } from "@/lib/geo/postcode";
import { prisma } from "@/lib/prisma";
import { MOCK_TWIN } from "@/lib/twin/mock";
import { footprintSize, geometryFromRecord } from "@/lib/twin/from-record";
import { engineResponseSchema, type EngineResponse } from "@/lib/twin/schema";
import type { RetrofitId, TwinState } from "@/lib/twin/types";

export type HomeLike = { id: string; nickname: string; postcode: string | null; record: unknown; footprint?: unknown; twin?: unknown; twinKey?: string | null };
export type Twin = TwinState & { source: "engine" | "mock" };
export type LlmContext = EngineResponse["llm"];

const engineUrl = () => process.env.ENGINE_URL;

async function post(path: string, body: unknown) {
  const res = await fetch(`${engineUrl()}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  if (!res.ok) throw new Error(`engine ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

/** A saved record in the current format: homes saved before a schema change are migrated on the way to the engine. */
export const engineRecord = (record: unknown) => normaliseRecord((record ?? {}) as Record<string, unknown>);

/** Where the home is, for the engine's climate region and location. Never sent to the share page. */
export async function placeOf(postcode: string | null) {
  const pc = postcode ? await findPostcode(postcode) : null;
  return pc ? { postcode: pc.postcode, lat: pc.lat, lon: pc.lon, region: pc.region, country: pc.country, district: pc.district } : {};
}

let health: { version: string; at: number } | null = null;
async function modelVersion() {
  if (health && Date.now() - health.at < 60_000) return health.version;
  const res = await fetch(`${engineUrl()}/health`, { cache: "no-store" });
  health = { version: ((await res.json()) as { modelVersion: string }).modelVersion, at: Date.now() };
  return health.version;
}

function withHome(home: HomeLike, twin: EngineResponse["twin"], scenario: RetrofitId[] | null): Twin {
  return {
    ...twin,
    homeId: home.id,
    scenarioId: scenario ? scenario.join("+") : null,
    nickname: home.nickname,
    postcode: home.postcode,
    geometry: geometryFromRecord((home.record ?? {}) as Partial<PropertyRecord>, footprintSize(home.footprint)),
    source: "engine",
  };
}

function mock(home: HomeLike): Twin {
  return { ...MOCK_TWIN, homeId: home.id, nickname: home.nickname, postcode: home.postcode, geometry: geometryFromRecord((home.record ?? {}) as Partial<PropertyRecord>, footprintSize(home.footprint)), source: "mock" };
}

/** The engine's analysis of a home and the facts the LLM may use, optionally for a what-if scenario. Null when the engine is unavailable. */
async function fetchTwin(home: HomeLike, scenario: RetrofitId[] | null): Promise<EngineResponse | null> {
  if (!engineUrl() || !home.record) return null;
  try {
    return engineResponseSchema.parse(await post("/twin", { record: engineRecord(home.record), place: await placeOf(home.postcode), retrofits: scenario }));
  } catch (e) {
    console.error("engine unavailable:", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function runEngine(home: HomeLike, scenario: RetrofitId[] | null = null): Promise<{ twin: Twin; llm: LlmContext } | null> {
  const r = await fetchTwin(home, scenario);
  return r && { twin: withHome(home, r.twin, scenario), llm: r.llm };
}

async function twinKey(home: HomeLike) {
  return createHash("sha256").update(JSON.stringify([engineRecord(home.record), await placeOf(home.postcode), await modelVersion()])).digest("hex");
}

/**
 * The twin and LLM facts for a home. Results are saved on the home against a key of the record, its place and the
 * engine's model version, so pages read them instantly and an edit or a retrain recomputes them. Null when the engine
 * is unavailable.
 */
export async function getAnalysis(home: HomeLike): Promise<{ twin: Twin; llm: LlmContext } | null> {
  if (!engineUrl() || !home.record) return null;
  let key: string;
  try {
    key = await twinKey(home);
  } catch {
    return null;
  }
  const cached = home.twinKey === key ? engineResponseSchema.safeParse(home.twin) : null;
  if (cached?.success) return { twin: withHome(home, cached.data.twin, null), llm: cached.data.llm };
  const r = await fetchTwin(home, null);
  if (!r) return null;
  await prisma.home
    .update({ where: { id: home.id }, data: { twin: r as unknown as Prisma.InputJsonValue, twinKey: key } })
    .catch((e) => console.error("could not save the twin", e));
  return { twin: withHome(home, r.twin, null), llm: r.llm };
}

/** The twin for a home, or the labelled example when the engine is unavailable. */
export async function getTwin(home: HomeLike): Promise<Twin> {
  return (await getAnalysis(home))?.twin ?? mock(home);
}

/** Any other engine endpoint; null when unavailable. */
export async function engineJson<T>(path: string, body?: unknown): Promise<T | null> {
  if (!engineUrl()) return null;
  try {
    return (body === undefined ? await (await fetch(`${engineUrl()}${path}`, { cache: "no-store" })).json() : await post(path, body)) as T;
  } catch (e) {
    console.error(`engine ${path}`, e instanceof Error ? e.message : e);
    return null;
  }
}

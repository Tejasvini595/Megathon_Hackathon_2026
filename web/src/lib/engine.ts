import "server-only";
import type { PropertyRecord } from "@/lib/extract/fields";
import { MOCK_TWIN } from "@/lib/twin/mock";
import { footprintSize, geometryFromRecord } from "@/lib/twin/from-record";
import type { TwinState } from "@/lib/twin/types";

type HomeLike = { id: string; nickname: string; postcode: string | null; record: unknown; footprint?: unknown };

/**
 * Asks the Python engine for the twin. Set ENGINE_URL to use it; otherwise returns the P10001-shaped
 * mock with this home's geometry so the UI is fully usable while the engine is being built.
 */
export async function getTwin(home: HomeLike, scenario?: { retrofits: string[] }): Promise<TwinState & { source: "engine" | "mock" }> {
  const record = (home.record ?? {}) as Partial<PropertyRecord>;
  const url = process.env.ENGINE_URL;
  if (url) {
    const res = await fetch(`${url}/twin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ homeId: home.id, record, footprint: footprintSize(home.footprint), scenario }),
      cache: "no-store",
    });
    if (res.ok) return { ...((await res.json()) as TwinState), source: "engine" };
    console.error("engine error", res.status, await res.text());
  }
  return {
    ...MOCK_TWIN,
    homeId: home.id,
    nickname: home.nickname,
    postcode: home.postcode,
    geometry: geometryFromRecord(record, footprintSize(home.footprint)),
    source: "mock",
  };
}

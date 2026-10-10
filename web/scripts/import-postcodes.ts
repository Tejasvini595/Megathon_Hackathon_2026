import { createReadStream } from "node:fs";
import { prisma } from "@/lib/prisma";
import { normalisePostcode } from "@/lib/geo/postcode";

const BATCH = 5000;

type Row = {
  postcode: string;
  lat: number;
  lon: number;
  outcode: string;
  district: string | null;
  region: string | null;
  country: string;
  terminated: boolean;
};

function splitCsv(line: string): string[] {
  if (!line.includes('"')) return line.split(",");
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

async function* lines(path: string) {
  const decoder = new TextDecoder();
  let rest = "";
  for await (const chunk of createReadStream(path)) {
    const parts = (rest + decoder.decode(chunk as Buffer, { stream: true })).split(/\r?\n/);
    rest = parts.pop() ?? "";
    yield* parts;
  }
  if (rest) yield rest;
}

async function flush(map: Map<string, Row>) {
  const rows = [...map.values()];
  const col = <K extends keyof Row>(k: K) => rows.map((r) => r[k]);
  await prisma.$executeRaw`
    INSERT INTO "Postcode" (postcode, lat, lon, outcode, district, region, country, terminated)
    SELECT * FROM unnest(
      ${col("postcode")}::text[], ${col("lat")}::float8[], ${col("lon")}::float8[],
      ${col("outcode")}::text[], ${col("district")}::text[], ${col("region")}::text[],
      ${col("country")}::text[], ${col("terminated")}::boolean[]
    )
    ON CONFLICT (postcode) DO UPDATE SET
      lat = EXCLUDED.lat, lon = EXCLUDED.lon, outcode = EXCLUDED.outcode,
      district = EXCLUDED.district, region = EXCLUDED.region,
      country = EXCLUDED.country, terminated = EXCLUDED.terminated`;
}

async function main(path: string | undefined) {
  if (!path) throw new Error("Usage: bun scripts/import-postcodes.ts <csv>");
  const iterator = lines(path);
  const header = splitCsv((await iterator.next()).value ?? "");
  const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
  const districtKey = "admin_district" in idx ? "admin_district" : "district";
  for (const k of ["postcode", "lat", "lon", "outcode", "region", "country", districtKey]) {
    if (!(k in idx)) throw new Error(`Missing column ${k}`);
  }

  let batch = new Map<string, Row>();
  let loaded = 0;
  let skipped = 0;
  const started = Date.now();

  for await (const line of iterator) {
    if (!line) continue;
    const f = splitCsv(line);
    const lat = parseFloat(f[idx.lat]);
    const lon = parseFloat(f[idx.lon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      skipped++;
      continue;
    }
    const postcode = normalisePostcode(f[idx.postcode]);
    batch.set(postcode, {
      postcode,
      lat,
      lon,
      outcode: f[idx.outcode].trim(),
      district: f[idx[districtKey]].trim() || null,
      region: f[idx.region].trim() || null,
      country: f[idx.country].trim(),
      terminated: "terminated" in idx && f[idx.terminated].trim() === "1",
    });
    if (batch.size >= BATCH) {
      await flush(batch);
      loaded += batch.size;
      batch = new Map();
      if (loaded % (BATCH * 20) === 0) console.log(`${loaded} rows (${Math.round((Date.now() - started) / 1000)}s)`);
    }
  }
  if (batch.size) {
    await flush(batch);
    loaded += batch.size;
  }
  console.log(`Done: ${loaded} rows loaded, ${skipped} skipped, ${Math.round((Date.now() - started) / 1000)}s`);
}

await main(process.argv[2]).finally(() => prisma.$disconnect());

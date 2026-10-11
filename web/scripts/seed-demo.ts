import type { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { normaliseRecord } from "@/lib/extract";
import { FIELDS, type ExtractedField, type FieldKey } from "@/lib/extract/fields";
import { confirmSchema } from "@/lib/extract/schema";
import { prisma } from "@/lib/prisma";

const DEMO = { email: "demo@ght.dev", password: "demo12345", name: "Demo" };

type Seed = {
  nickname: string;
  postcode: string;
  description: string;
  record: Record<string, unknown>;
  /** Evidence per field the description states; everything else is recorded as a default. */
  evidence: Partial<Record<FieldKey, string>>;
};

const MONTHS_BRIEF = [{ month: "2025-10", elecKwh: 430, gasKwh: 1450 }, { month: "2025-11", elecKwh: 470, gasKwh: 2100 }, { month: "2025-12", elecKwh: 520, gasKwh: 2700 }, { month: "2026-01", elecKwh: 540, gasKwh: 2900 }, { month: "2026-02", elecKwh: 490, gasKwh: 2450 }, { month: "2026-03", elecKwh: 450, gasKwh: 1900 }, { month: "2026-04", elecKwh: 410, gasKwh: 1300 }, { month: "2026-05", elecKwh: 380, gasKwh: 800 }, { month: "2026-06", elecKwh: 360, gasKwh: 520 }, { month: "2026-07", elecKwh: 350, gasKwh: 480 }, { month: "2026-08", elecKwh: 360, gasKwh: 500 }, { month: "2026-09", elecKwh: 420, gasKwh: 900 }];
// A heat pump home: electricity only, with the winter peak.
const MONTHS_FLAT = [{ month: "2025-10", elecKwh: 380, gasKwh: 0 }, { month: "2025-11", elecKwh: 520, gasKwh: 0 }, { month: "2025-12", elecKwh: 640, gasKwh: 0 }, { month: "2026-01", elecKwh: 690, gasKwh: 0 }, { month: "2026-02", elecKwh: 600, gasKwh: 0 }, { month: "2026-03", elecKwh: 500, gasKwh: 0 }, { month: "2026-04", elecKwh: 380, gasKwh: 0 }, { month: "2026-05", elecKwh: 300, gasKwh: 0 }, { month: "2026-06", elecKwh: 260, gasKwh: 0 }, { month: "2026-07", elecKwh: 250, gasKwh: 0 }, { month: "2026-08", elecKwh: 260, gasKwh: 0 }, { month: "2026-09", elecKwh: 320, gasKwh: 0 }];

const HOMES: Seed[] = [
  {
    // Matches the brief: rating E (SAP 47), high electricity and gas use, no solar, uninsulated cavity
    // walls, a thin loft, single glazing and a gas boiler from before 2005. The rest is our plausible
    // filler: an inter-war semi (the typical E-rated stock), ~85 m², 3 beds, a timer-only control set.
    nickname: "Brief example (P10001)",
    postcode: "M14 6HT",
    description:
      "Semi-detached 1930s house, 3 bedrooms, about 85 m2. EPC rating E, score 47. Cavity walls with no insulation, only 50mm of loft insulation, single glazing throughout. Original gas boiler from the nineties with a timer only, no solar panels. Bills are high for both gas and electricity.",
    record: {
      propertyType: "house", builtForm: "semi", storeys: 2, ageBand: "1930_1949", floorAreaM2: 85, rooms: 4, wallType: "cavity", wallInsulation: "none", roofType: "gable", loftInsulation: "thin",
      floorType: "suspended", floorInsulation: "none", glazing: "single", heating: "gas_boiler", boilerAge: "before_2005", controls: "programmer", solarPv: "no", epcBand: "E", sapScore: 47,
      usage: { months: MONTHS_BRIEF },
    },
    evidence: {
      propertyType: "Your description says a house", builtForm: "Your description says semi-detached", ageBand: "Your description says 1930s", floorAreaM2: "Your description states about 85 m2", rooms: "Your description counts 3 bedrooms and assumes one living room",
      wallType: "Your description mentions cavity walls", wallInsulation: "Your description says no wall insulation", loftInsulation: "Your description states 50mm of loft insulation",
      glazing: "Your description says single glazing", heating: "Your description mentions a gas boiler", boilerAge: "Your description says an original boiler from the nineties", controls: "Your description says a timer only", solarPv: "Your description says no solar panels",
      epcBand: "Your description states the EPC band", sapScore: "Your description states the EPC score",
    },
  },
  {
    nickname: "Victorian terrace, Bristol",
    postcode: "BS6 5AB",
    description:
      "Victorian mid-terrace house in Bristol, 3 bedrooms over 3 storeys, around 110 m2. Solid brick walls with no insulation, 100mm in the loft, suspended timber floor, some double glazing but the original sash windows are still single. Gas boiler with TRVs fitted in 2012. Our yearly bills come to about 14,500 kWh of gas and 3,300 kWh of electricity.",
    record: {
      propertyType: "house", builtForm: "mid_terrace", storeys: 3, ageBand: "pre1900", floorAreaM2: 110, rooms: 4, wallType: "solid_brick", wallInsulation: "none", roofType: "gable", loftInsulation: "some",
      floorType: "suspended", floorInsulation: "none", glazing: "partial_double", heating: "gas_boiler", boilerAge: "from_2005", controls: "thermostat_trvs", solarPv: "no", epcBand: "unknown",
      usage: { annual: { elecKwh: 3300, gasKwh: 14500 } },
    },
    evidence: {
      propertyType: "Your description says a house", builtForm: "Your description says mid-terrace", storeys: "Your description says 3 storeys", ageBand: "Your description says Victorian", floorAreaM2: "Your description states around 110 m2", rooms: "Your description counts 3 bedrooms and assumes one living room",
      wallType: "Your description mentions solid brick walls", wallInsulation: "Your description says no insulation", loftInsulation: "Your description states 100mm in the loft", floorType: "Your description mentions a suspended timber floor",
      glazing: "Your description says some double glazing", heating: "Your description mentions a gas boiler", boilerAge: "Your description says the boiler was fitted in 2012", controls: "Your description mentions TRVs", solarPv: "Your description does not mention solar",
    },
  },
  {
    nickname: "New-build flat, Manchester",
    postcode: "M14 4AJ",
    description:
      "Top-floor flat in a 6-storey new-build block in Manchester, built 2015. 2 bedrooms, 65 m2. EPC B, score 84. Insulated cavity walls and a warm flat roof, triple glazing, an air source heat pump with a smart thermostat set to 21 degrees. Solar panels on the block roof are shared between flats (about 2.4 kW each).",
    record: {
      propertyType: "flat", builtForm: "flat", storeys: 1, flatLevel: "top", blockStoreys: 6, ageBand: "2012_2021", floorAreaM2: 65, rooms: 3, wallType: "cavity", wallInsulation: "full", roofType: "flat", flatRoofInsulation: "full",
      glazing: "triple", heating: "heat_pump_air", controls: "smart", solarPv: "yes", solarKw: 2.4, epcBand: "B", sapScore: 84, thermostatC: 21, currentValueGbp: 310000,
      usage: { months: MONTHS_FLAT },
    },
    evidence: {
      propertyType: "Your description says a flat", builtForm: "A flat is part of a block", flatLevel: "Your description says top floor", blockStoreys: "Your description says a 6-storey block", ageBand: "Your description says built 2015", floorAreaM2: "Your description states 65 m2", rooms: "Your description counts 2 bedrooms and assumes one living room",
      wallType: "Your description mentions cavity walls", wallInsulation: "Your description says the walls are insulated", flatRoofInsulation: "Your description says a warm flat roof", glazing: "Your description says triple glazing", heating: "Your description mentions an air source heat pump",
      controls: "Your description mentions a smart thermostat", solarPv: "Your description mentions shared solar on the block roof", solarKw: "Your description gives about 2.4 kW each", epcBand: "Your description states EPC B", sapScore: "Your description states the score 84", thermostatC: "Your description says 21 degrees",
    },
  },
];

async function ensureUser() {
  const existing = await prisma.user.findUnique({ where: { email: DEMO.email } });
  if (existing) return existing;
  await auth.api.signUpEmail({ body: DEMO });
  return prisma.user.findUniqueOrThrow({ where: { email: DEMO.email } });
}

const user = await ensureUser();

for (const seed of HOMES) {
  const record = normaliseRecord({ ...seed.record, postcode: seed.postcode });
  const { postcode, ...fieldsOnly } = record;
  const parsed = confirmSchema.parse({ nickname: seed.nickname, record: fieldsOnly });

  const fields = Object.fromEntries(
    FIELDS.filter(({ key }) => parsed.record[key] != null).map(({ key }) => {
      const value = parsed.record[key]!;
      const evidence = seed.evidence[key];
      const f: ExtractedField = evidence
        ? { value, confidence: 0.9, source: "text", evidence }
        : { value, confidence: 0.35, source: "default", evidence: "Not mentioned; typical value used" };
      return [key, f];
    }),
  ) as unknown as Prisma.InputJsonValue;

  const existing = await prisma.home.findFirst({ where: { userId: user.id, nickname: seed.nickname }, select: { id: true } });
  const data = {
    status: "CONFIRMED" as const,
    postcode,
    record: parsed.record,
    inputs: { create: { kind: "TEXT" as const, text: seed.description } },
    extractions: { create: { status: "DONE" as const, models: ["seed-demo"], fields, conflicts: [] } },
  };
  if (existing) {
    // Replace inputs and extractions so re-runs don't pile up duplicates; scenarios, chat and shares are kept.
    await prisma.$transaction([
      prisma.homeInput.deleteMany({ where: { homeId: existing.id } }),
      prisma.extraction.deleteMany({ where: { homeId: existing.id } }),
      prisma.home.update({ where: { id: existing.id }, data }),
    ]);
    console.log(`updated  ${seed.nickname} (${existing.id})`);
  } else {
    const home = await prisma.home.create({ data: { ...data, userId: user.id, nickname: seed.nickname }, select: { id: true } });
    console.log(`created  ${seed.nickname} (${home.id})`);
  }
}

console.log(`\nDemo user: ${DEMO.email} / ${DEMO.password}`);
await prisma.$disconnect();

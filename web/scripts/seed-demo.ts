import type { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { normaliseRecord } from "@/lib/extract";
import { FIELDS, type ExtractedField, type FieldKey, type PropertyRecord } from "@/lib/extract/fields";
import { confirmSchema } from "@/lib/extract/schema";
import { prisma } from "@/lib/prisma";

const DEMO = { email: "demo@ght.dev", password: "demo12345", name: "Demo" };

type Seed = {
  nickname: string;
  postcode: string;
  description: string;
  record: Partial<PropertyRecord>;
  /** Evidence per field the description states; everything else is recorded as a default. */
  evidence: Partial<Record<FieldKey, string>>;
};

const HOMES: Seed[] = [
  {
    // The brief only says: rating E, high electricity and gas use, no solar, poor insulation, gas boiler,
    // single glazing. Everything else is our plausible filler: an inter-war semi (the typical E-rated
    // stock, matching the app's mock twin and DEFAULTS), ~85 m², 3 beds, unfilled cavity walls and a thin
    // 50 mm loft ("poor insulation"), a programmer-only control set (no smart controls, hence high gas use).
    nickname: "Brief example (P10001)",
    postcode: "M14 6HT",
    description:
      "Semi-detached 1930s house, 3 bedrooms, about 85 m2. Cavity walls with no insulation, only 50mm of loft insulation, single glazing throughout. Gas boiler with a timer only, no solar panels. Bills are high for both gas and electricity.",
    record: { propertyType: "house", builtForm: "semi", storeys: 2, ageBand: "1930_1949", floorAreaM2: 85, bedrooms: 3, wallType: "cavity", wallInsulation: "none", roofType: "gable", loftInsulationMm: 50, glazing: "single", heating: "gas_boiler", secondaryHeating: [], controls: "programmer", solarPv: "no" },
    evidence: {
      propertyType: "Your description says a house", builtForm: "Your description says semi-detached", ageBand: "Your description says 1930s", floorAreaM2: "Your description states about 85 m2", bedrooms: "Your description states 3 bedrooms",
      wallType: "Your description mentions cavity walls", wallInsulation: "Your description says no wall insulation", loftInsulationMm: "Your description states 50mm of loft insulation",
      glazing: "Your description says single glazing", heating: "Your description mentions a gas boiler", controls: "Your description says a timer only", solarPv: "Your description says no solar panels",
    },
  },
  {
    nickname: "Victorian terrace, Bristol",
    postcode: "BS6 5AB",
    description:
      "Victorian mid-terrace house in Bristol, 3 bedrooms over 3 storeys, around 110 m2. Solid brick walls with no insulation, 100mm in the loft, some double glazing but the original sash windows are still single. Gas boiler with TRVs, plus a wood burner in the front room.",
    record: { propertyType: "house", builtForm: "mid_terrace", storeys: 3, ageBand: "pre1900", floorAreaM2: 110, bedrooms: 3, wallType: "solid", wallInsulation: "none", roofType: "gable", loftInsulationMm: 100, glazing: "partial_double", heating: "gas_boiler", secondaryHeating: ["wood_stove"], controls: "thermostat_trvs", solarPv: "no" },
    evidence: {
      propertyType: "Your description says a house", builtForm: "Your description says mid-terrace", storeys: "Your description says 3 storeys", ageBand: "Your description says Victorian", floorAreaM2: "Your description states around 110 m2", bedrooms: "Your description states 3 bedrooms",
      wallType: "Your description mentions solid brick walls", wallInsulation: "Your description says no insulation", loftInsulationMm: "Your description states 100mm in the loft",
      glazing: "Your description says some double glazing", heating: "Your description mentions a gas boiler", secondaryHeating: "Your description mentions a wood burner", controls: "Your description mentions TRVs", solarPv: "Your description does not mention solar",
    },
  },
  {
    nickname: "New-build flat, Manchester",
    postcode: "M14 4AJ",
    description:
      "Top-floor flat in a 6-storey new-build block in Manchester, built 2015. 2 bedrooms, 65 m2. Insulated cavity walls, triple glazing, an air source heat pump with a smart thermostat. Solar panels on the block roof are shared between flats.",
    record: { propertyType: "flat", builtForm: "flat", storeys: 1, flatLevel: "top", blockStoreys: 6, ageBand: "2012_plus", floorAreaM2: 65, bedrooms: 2, wallType: "cavity", wallInsulation: "full", roofType: "flat", loftInsulationMm: 0, glazing: "triple", heating: "heat_pump", secondaryHeating: [], controls: "smart", solarPv: "yes" },
    evidence: {
      propertyType: "Your description says a flat", builtForm: "A flat is part of a block", flatLevel: "Your description says top floor", blockStoreys: "Your description says a 6-storey block", ageBand: "Your description says built 2015", floorAreaM2: "Your description states 65 m2", bedrooms: "Your description states 2 bedrooms",
      wallType: "Your description mentions cavity walls", wallInsulation: "Your description says the walls are insulated", glazing: "Your description says triple glazing", heating: "Your description mentions a heat pump", controls: "Your description mentions a smart thermostat", solarPv: "Your description mentions shared solar on the block roof",
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
    FIELDS.map(({ key }) => {
      const evidence = seed.evidence[key];
      const f: ExtractedField = evidence
        ? { value: record[key], confidence: 0.9, source: "text", evidence }
        : { value: record[key], confidence: 0.35, source: "default", evidence: "Not applicable or not mentioned; typical value used" };
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

import { describe, expect, test } from "bun:test";
import { normaliseRecord } from "@/lib/extract";
import { missingOf } from "./missing";

const usage = { annual: { elecKwh: 3000, gasKwh: 0 } };

describe("missingOf", () => {
  test("a defaulted record only lacks usage", () => {
    expect(missingOf(normaliseRecord({}), undefined)).toEqual([{ step: "usage", message: "Add your energy use" }]);
    expect(missingOf(normaliseRecord({}), usage)).toEqual([]);
  });
  test("a required field without a value is listed, optional ones are not", () => {
    const r = { ...normaliseRecord({}), glazing: null, thermostatC: null };
    expect(missingOf(r, usage)).toEqual([{ step: "windows", message: "Glazing is missing" }]);
  });
  test("a score outside its band is a problem", () => {
    const r = normaliseRecord({ epcBand: "C", sapScore: 47 });
    expect(missingOf(r, usage).map((m) => m.message)).toEqual(["EPC score 47 isn't in band C"]);
  });
  test("fields that don't apply are not asked for", () => {
    const r = { ...normaliseRecord({ propertyType: "flat", flatLevel: "mid" }), roofType: null, loftInsulation: null };
    expect(missingOf(r, usage)).toEqual([]);
  });
  test("monthly readings need a winter month", () => {
    const months = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"].map((month) => ({ month, elecKwh: 300, gasKwh: 100 }));
    expect(missingOf(normaliseRecord({}), { months }).map((m) => m.message)).toEqual(["Include at least one month from December to February"]);
  });
});

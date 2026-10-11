import { describe, expect, test } from "bun:test";
import { normaliseRecord } from "@/lib/extract";
import type { FieldKey } from "@/lib/extract/fields";
import type { FieldImpact, QuestionPlan } from "@/lib/questions";
import { alternativesOf, arrange, reasonOf, topQuestions } from "./question-order";

const impact = (key: FieldKey, rank: number, o: Partial<FieldImpact> = {}): FieldImpact => ({ key, best: "x", probabilities: {}, confident: false, scoreSpread: 0, planChangeProb: 0, billSpreadGbp: 0, rank, ...o });
const plan = (fields: FieldImpact[]): QuestionPlan => ({ fields, threshold: 0.85, source: "engine" });
const guess = { source: "default" };

describe("reasonOf", () => {
  test("shows only the non-trivial parts", () => {
    expect(reasonOf(impact("wallType", 1, { scoreSpread: 3.2, planChangeProb: 0.4, billSpreadGbp: 71 }))).toBe("Could change your plan · ±3 score points · ~£70/yr");
    expect(reasonOf(impact("wallType", 1, { scoreSpread: 1, billSpreadGbp: 5 }))).toBe("±1 score point");
    expect(reasonOf(impact("wallType", 1, { scoreSpread: 0.2 }))).toBe("");
  });
});

describe("arrange", () => {
  const keys: FieldKey[] = ["wallType", "wallInsulation", "floorType", "floorInsulation"];
  const fields = { wallType: guess, wallInsulation: guess, floorType: guess, floorInsulation: guess };
  const p = plan([
    impact("floorType", 1, { scoreSpread: 0.1 }),
    impact("wallInsulation", 2, { scoreSpread: 4 }),
    impact("wallType", 3, { planChangeProb: 0.5 }),
    impact("floorInsulation", 4, { confident: true, scoreSpread: 5 }),
  ]);
  test("ranks what matters, pre-fills confident ones, groups the rest as quick confirms", () => {
    const a = arrange(keys, p, fields);
    expect(a.main).toEqual(["wallInsulation", "wallType"]);
    expect(a.confident).toEqual(["floorInsulation"]);
    expect(a.quick).toEqual(["floorType"]);
    expect([...a.matters].sort()).toEqual(["wallInsulation", "wallType"]);
  });
  test("without a plan the order is unchanged", () => {
    expect(arrange(keys, null, fields).main).toEqual(keys);
    expect(arrange(keys, { fields: [], threshold: 0.85, source: "unavailable" }, fields).quick).toEqual([]);
  });
  test("fields the engine did not rank keep their order after the ranked ones", () => {
    expect(arrange(keys, plan([impact("floorType", 1, { scoreSpread: 2 })]), fields).main).toEqual(["floorType", "wallType", "wallInsulation", "floorInsulation"]);
  });
  test("an answered field keeps its place but loses the marker", () => {
    const a = arrange(keys, p, { ...fields, wallInsulation: { source: "you" } });
    expect(a.main).toEqual(["wallInsulation", "wallType"]);
    expect(a.matters.has("wallInsulation")).toBe(false);
  });
});

describe("topQuestions", () => {
  test("skips confident, answered and trivial fields", () => {
    const p = plan([impact("wallType", 1, { scoreSpread: 3 }), impact("glazing", 2, { scoreSpread: 3, confident: true }), impact("heating", 3, { scoreSpread: 3 }), impact("controls", 4)]);
    const shown = new Set<FieldKey>(["wallType", "glazing", "heating", "controls"]);
    expect(topQuestions(p, { wallType: guess, heating: { source: "you" } }, shown).map((f) => f.key)).toEqual(["wallType"]);
    expect(topQuestions(null, {}, shown)).toEqual([]);
  });
});

describe("alternativesOf", () => {
  const record = normaliseRecord({});
  test("guessed choice fields get an even spread, stated and answered ones none", () => {
    const alts = alternativesOf({ wallType: guess, glazing: { source: "text" }, wallInsulation: { source: "you" } }, {}, record);
    expect(Object.keys(alts)).toEqual(["wallType"]);
    expect(Object.values(alts.wallType!).every((v) => Math.abs(v - 0.2) < 1e-9)).toBe(true);
  });
  test("the decision model's own numbers win", () => {
    const probabilities = { cavity: 0.7, solid_brick: 0.3 };
    const f = { value: "cavity", confidence: 0.7, evidence: "", source: "default" as const };
    expect(alternativesOf({ wallType: guess }, { wallType: { ...f, probabilities } }, record).wallType).toEqual(probabilities);
  });
});

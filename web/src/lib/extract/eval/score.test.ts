import { describe, expect, test } from "bun:test";
import { matches, summarise, tierOf, type Outcome } from "./score";

describe("matches", () => {
  test("lists compare as sets", () => expect(matches("secondaryHeating", ["gas_fire", "open_fire"], ["open_fire", "gas_fire"])).toBe(true));
  test("a missing list item is wrong", () => expect(matches("secondaryHeating", ["gas_fire"], [])).toBe(false));
  test("steppy numbers allow one step", () => {
    expect(matches("loftInsulationMm", 270, 275)).toBe(true);
    expect(matches("loftInsulationMm", 270, 100)).toBe(false);
  });
  test("counts are exact", () => expect(matches("bedrooms", 3, 4)).toBe(false));
});

test("tiers follow the review UI", () => {
  expect([0.9, 0.85, 0.6, 0.35].map(tierOf)).toEqual(["Sure", "Sure", "Likely", "Guess"]);
});

test("summary averages fields before cases", () => {
  const o = (key: string, correct: boolean): Outcome => ({ caseId: "c", key: key as Outcome["key"], gold: 1, value: 1, confidence: 0.9, source: "text", correct, filled: true });
  const s = summarise([o("bedrooms", true), o("bedrooms", true), o("bedrooms", true), o("storeys", false)]);
  expect(s.micro).toBe(0.75);
  expect(s.macro).toBe(0.5);
});

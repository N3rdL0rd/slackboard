import { describe, expect, it } from "vitest";
import { formatLength, formatWeight, ftToM, kgToLb, lbToKg, lengthIn, lengthToM, mToFt, roundTo, weightIn, weightStep, weightToKg } from "./units";

describe("conversions", () => {
  it("converts between kilograms and pounds, and metres and feet", () => {
    expect(kgToLb(1)).toBeCloseTo(2.20462, 4);
    expect(lbToKg(100)).toBeCloseTo(45.359237, 6);
    expect(mToFt(30)).toBeCloseTo(98.4252, 3);
    expect(ftToM(100)).toBeCloseTo(30.48, 6);
  });
  it("leaves a value alone in the unit it is already in, and round trips through the other", () => {
    expect(weightIn(62.5, "kg")).toBe(62.5);
    expect(weightToKg(62.5, "kg")).toBe(62.5);
    expect(weightToKg(weightIn(62.5, "lb"), "lb")).toBeCloseTo(62.5, 9);
    expect(lengthToM(lengthIn(45, "ft"), "ft")).toBeCloseTo(45, 9);
    expect(lengthIn(45, "m")).toBe(45);
  });
});

describe("showing weights and lengths", () => {
  it("shows kilograms to the nearest half and pounds to the nearest pound, trimming a trailing zero", () => {
    expect(formatWeight(62.5, "kg")).toBe("62.5 kg");
    expect(formatWeight(62, "kg")).toBe("62 kg");
    expect(formatWeight(62.3, "kg")).toBe("62.5 kg");
    expect(formatWeight(20, "lb")).toBe("44 lb");
  });
  it("adds a plus sign to added weight, and none to zero", () => {
    expect(formatWeight(18.5, "kg", { signed: true })).toBe("+18.5 kg");
    expect(formatWeight(0, "kg", { signed: true })).toBe("0 kg");
  });
  it("shows lengths as whole numbers", () => {
    expect(formatLength(45, "m")).toBe("45 m");
    expect(formatLength(45, "ft")).toBe("148 ft");
  });
  it("steps weights by half a kilo or a pound", () => {
    expect(weightStep("kg")).toBe(0.5);
    expect(weightStep("lb")).toBe(1);
    expect(roundTo(62.3, 0.5)).toBe(62.5);
  });
});

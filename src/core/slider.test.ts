import { describe, expect, it } from "vitest";
import { fractionOf, indexAt, stepIndex } from "./slider";

describe("slider maths", () => {
  it("picks the nearest stop, clamping a touch past either end", () => {
    expect(indexAt(0, 300, 4)).toBe(0);
    expect(indexAt(140, 300, 4)).toBe(1); // stops sit at 0, 100, 200, 300
    expect(indexAt(160, 300, 4)).toBe(2);
    expect(indexAt(-40, 300, 4)).toBe(0);
    expect(indexAt(900, 300, 4)).toBe(3);
  });
  it("copes with one stop or an unmeasured track", () => {
    expect(indexAt(50, 300, 1)).toBe(0);
    expect(indexAt(50, 0, 5)).toBe(0);
    expect(fractionOf(0, 1)).toBe(0);
  });
  it("places stops evenly and steps without leaving the track", () => {
    expect(fractionOf(2, 5)).toBe(0.5);
    expect(stepIndex(0, -1, 5)).toBe(0);
    expect(stepIndex(4, 1, 5)).toBe(4);
    expect(stepIndex(2, 1, 5)).toBe(3);
  });
});

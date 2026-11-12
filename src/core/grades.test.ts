import { describe, expect, it } from "vitest";
import { bandForV, GradeScale } from "./grades";

const scale = new GradeScale([{ difficulty: 20, boulder_name: "6b+/V4", route_name: "6c/5.11b" }]);

describe("grade labels", () => {
  it("shows boulder grades as V and Font, and routes as YDS and French", () => {
    expect(scale.label(20, "both")).toEqual({ primary: "V4", secondary: "6b+" });
    expect(scale.label(20, "both", true)).toEqual({ primary: "5.11b", secondary: "6c" });
    expect(scale.label(20, "font")).toEqual({ primary: "6b+", secondary: null });
    expect(scale.label(20, "v", true)).toEqual({ primary: "5.11b", secondary: null });
  });
  it("rounds fractional community grades to the nearest listed one and picks the colour band by V", () => {
    expect(scale.vName(19.6)).toBe("V4");
    expect(scale.band(20).name).toBe("green");
  });
});

describe("grade colour bands", () => {
  const scale = new GradeScale(Array.from({ length: 24 }, (_, i) => ({ difficulty: 10 + i, boulder_name: `x/V${Math.floor(i / 1.5)}`, route_name: "" })));
  it("goes on past V9: black, then violet, amber and lime, two grades each", () => {
    const names = (vs: number[]) => vs.map((v) => bandForV(v).name);
    expect(names([0, 1, 2, 3, 4, 5, 6, 7, 8])).toEqual(["pink", "blue", "blue", "green", "green", "white", "white", "red", "red"]);
    expect(names([9, 10, 11, 12, 13, 14, 15, 16, 17])).toEqual(["black", "black", "violet", "violet", "amber", "amber", "lime", "lime", "lime"]);
    expect(scale.vNumber(10)).toBeGreaterThanOrEqual(0);
  });

  it("keeps every V9+ chip black with a coloured ring and number, readable against the card", () => {
    for (const v of [9, 11, 13, 15]) {
      const b = bandForV(v);
      expect(b.fill).toBe("#050607");
      expect(b.text).toBe(b.border);
      expect(b.borderWidth).toBeGreaterThan(0);
    }
    expect(new Set([9, 11, 13, 15].map((v) => bandForV(v).border)).size).toBe(4);
  });

  it("gives bars a visible colour even for the near-black chips", () => {
    for (const v of [0, 3, 5, 7, 9, 11, 13, 15]) expect(bandForV(v).bar).not.toBe("#050607");
  });
});

describe("common grade", () => {
  const s = new GradeScale([
    { difficulty: 14, boulder_name: "5c/V2", route_name: "" }, { difficulty: 15, boulder_name: "6a/V3", route_name: "" },
    { difficulty: 16, boulder_name: "6a+/V3", route_name: "" }, { difficulty: 18, boulder_name: "6b+/V4", route_name: "" },
  ]);
  it("is the V number plus the row's place within that V grade", () => {
    expect(s.toCommon(14)).toBe(2);
    expect(s.toCommon(15)).toBe(3);
    expect(s.toCommon(16)).toBe(3.5);
    expect(s.toCommon(18)).toBe(4);
  });
  it("orders harder climbs higher across the whole scale", () => {
    const g = [14, 15, 16, 18].map((d) => s.toCommon(d));
    expect([...g].sort((a, b) => a - b)).toEqual(g);
  });
  it("round-trips every row", () => {
    for (const r of s.rows) expect(s.fromCommon(s.toCommon(r.difficulty))).toBe(r.difficulty);
  });
  it("maps an in-between grade to the nearest row and an unlisted V to the nearest listed one", () => {
    expect(s.fromCommon(3.4)).toBe(16);
    expect(s.fromCommon(3.1)).toBe(15);
    expect(s.fromCommon(9)).toBe(18);
  });
});

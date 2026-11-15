import { describe, expect, it } from "vitest";
import { clockOffset, fixed, span } from "./devFormat";

describe("developer formatting", () => {
  it("writes an offset from the start as minutes and seconds, with a sign before the start", () => {
    expect(clockOffset(65_000, 0)).toBe("1:05");
    expect(clockOffset(0, 0)).toBe("0:00");
    expect(clockOffset(-5000, 0)).toBe("-0:05");
  });

  it("writes fixed places, and a dash for nothing", () => {
    expect(fixed(1.234, 2)).toBe("1.23");
    expect(fixed(null)).toBe("-");
    expect(fixed(Number.NaN)).toBe("-");
  });

  it("picks a unit for a length of time", () => {
    expect(span(250)).toBe("250 ms");
    expect(span(1500)).toBe("1.5 s");
    expect(span(300_000)).toBe("5.0 min");
    expect(span(null)).toBe("-");
  });
});

import { describe, expect, it } from "vitest";
import { tension } from "./tension";

const ble = tension.ble!;

describe("Tension controller names", () => {
  it("reads the serial and API level from the advertised name", () => {
    expect(ble.parseName("Tension Board 2#84669@3")).toEqual({ displayName: "Tension Board 2", serial: "84669", apiLevel: 3 });
  });
  it("defaults to API level 2 and no serial", () => {
    expect(ble.parseName("Tension")).toEqual({ displayName: "Tension", serial: null, apiLevel: 2 });
  });
  it("accepts a serial with letters, in any case", () => {
    expect(ble.parseName("Tension#AbC9").serial).toBe("AbC9");
  });
});

describe("Tension LED encoding", () => {
  const holes = [{ position: 0x11e, color: "FF00FF" }, { position: 0x155, color: "00FF00" }];
  it("uses the 3-byte V3 format from API level 3", () => {
    expect(ble.encode(holes, 3).slice(3, 7)).toEqual([2, 84, 0x1e, 0x01]);
  });
  it("uses the V2 format below level 3", () => {
    expect(ble.encode(holes, 2)[4]).toBe(80);
  });
  it("an empty list is a single clearing message", () => {
    expect(ble.encode([], 3)).toEqual([1, 1, 0xab, 2, 84, 3]);
  });
});

describe("Tension links", () => {
  it("builds share links from lower-case ids", () => {
    expect(tension.links.climb("ABC")).toBe("https://tensionboardapp2.com/climbs/abc");
    expect(tension.links.circuit("DEF")).toBe("https://tensionboardapp2.com/circuits/def");
  });
});

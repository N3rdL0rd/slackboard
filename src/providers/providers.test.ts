import { isBoardName } from "../core/ble";
import { describe, expect, it } from "vitest";
import { getProvider, providers } from ".";

describe("providers", () => {
  it("each brand has its own host, image host and Bluetooth name, and ids are unique", () => {
    expect(new Set(providers.map((p) => p.id)).size).toBe(providers.length);
    expect(new Set(providers.map((p) => p.host)).size).toBe(providers.length);
    expect(providers.map((p) => p.ble?.nameSubstring)).toEqual(["Tension", "Decoy", "Grasshopper", "Moonboard"]);
    expect(getProvider("decoy").imgHost).toBe("https://api.decoyboardapp.com/img");
    expect(getProvider("grasshopper").links.climb("ABC")).toBe("https://grasshopperboardapp.com/climbs/abc");
  });
  it("MoonBoard is local: no account host, no server features, its own packet and case-insensitive name", () => {
    const m = getProvider("moonboard");
    expect(m.kind).toBe("local");
    expect(providers.filter((p) => p.kind === "remote").map((p) => p.id)).toEqual(["tension", "decoy", "grasshopper"]);
    expect(Object.values(m.capabilities).some(Boolean)).toBe(false);
    expect(String.fromCharCode(...m.ble!.encode([{ position: 3, color: "00FF00" }, { position: 9, color: "FF0000" }], 0))).toBe("l#S3,E9#");
    expect(isBoardName("MoonBoard A", m.ble!)).toBe(true);
    expect(isBoardName("Moonboard A", m.ble!)).toBe(true);
    expect(isBoardName("moonboard a", getProvider("tension").ble!)).toBe(false);
  });
  it("an unknown id falls back to the default provider", () => {
    expect(getProvider("nope").id).toBe("tension");
    expect(getProvider(undefined).id).toBe("tension");
  });
  it("brands share the Aurora packets but each parses its own device names", () => {
    const [t, d, g] = ["tension", "decoy", "grasshopper"].map((id) => getProvider(id).ble!);
    const holes = [{ position: 5, color: "00FF00" }];
    expect(d.encode(holes, 3)).toEqual(t.encode(holes, 3));
    expect(g.parseName("Grasshopper Wall#4411@3")).toEqual({ displayName: "Grasshopper Wall", serial: "4411", apiLevel: 3 });
    expect(d.scanService).toBe(t.scanService);
  });
});

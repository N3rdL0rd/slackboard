import { describe, expect, it } from "vitest";
import { layoutIdOf, setupByKey, SETUPS } from "./moonboard";
import { anglesOf, AVAILABLE_SETUPS, SOURCES, sourceFor, targetOfLayout } from "./moonSources";

describe("problem sources", () => {
  it("every source is a real setup at an angle the setup comes at", () => {
    for (const s of SOURCES) {
      const setup = setupByKey(s.setup);
      expect(setup, s.setup).toBeDefined();
      expect(setup!.angles).toContain(s.angle);
    }
  });

  it("is pinned to a revision, never a moving branch", () => {
    for (const s of SOURCES) {
      expect(s.url).toMatch(/^https:\/\//);
      expect(s.url, s.setup).not.toMatch(/\/(master|main|HEAD)\//);
      expect(s.url, s.setup).toMatch(/\/[0-9a-f]{40}\//);
    }
  });

  it("has one source per setup and angle, and offers only setups that have one", () => {
    expect(new Set(SOURCES.map((s) => `${s.setup}:${s.angle}`)).size).toBe(SOURCES.length);
    expect(AVAILABLE_SETUPS.map((s) => s.key).sort()).toEqual([...new Set(SOURCES.map((s) => s.setup))].sort());
    expect(anglesOf("mini2020")).toEqual([40]);
    expect(sourceFor("2017", 40)).toBeUndefined();
    expect(AVAILABLE_SETUPS.some((s) => s.key === "2017")).toBe(false);
  });

  it("maps a layout id back to its setup and angle, and refuses ids that are not MoonBoard's", () => {
    for (const setup of SETUPS) {
      for (const angle of [25, 40]) expect(targetOfLayout(layoutIdOf(setup, angle))).toEqual({ setup, angle });
    }
    expect(targetOfLayout(10)).toBeNull();
    expect(targetOfLayout(0)).toBeNull();
  });
});

describe("hold art", () => {
  it("every setup has its bundled art file and a registry entry under the name the database uses", async () => {
    const { existsSync, readFileSync } = await import("node:fs");
    const { artName } = await import("./moonboard");
    const registry = readFileSync("src/data/moonArt.ts", "utf8");
    for (const s of SETUPS) {
      expect(existsSync(`assets/moonboard/${s.key}.webp`), s.key).toBe(true);
      expect(registry, s.key).toContain(`"${artName(s)}": require("../../assets/moonboard/${s.key}.webp")`);
    }
  });
});

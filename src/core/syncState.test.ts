import { describe, expect, it } from "vitest";
import { pendingProvider, settingUpProviders } from "./syncState";

const accounts = { tension: {}, decoy: {} };
const unfinished = { tension: { initialDone: false }, decoy: { initialDone: false } };

describe("first sync gating", () => {
  it("requires an unfinished provider that was not deferred", () => {
    expect(pendingProvider(accounts, unfinished)).toBe("tension");
    expect(pendingProvider(accounts, unfinished, { tension: true })).toBe("decoy");
    expect(pendingProvider(accounts, unfinished, { tension: true, decoy: true })).toBeNull();
    expect(pendingProvider(accounts, { tension: { initialDone: true }, decoy: { initialDone: null } })).toBeNull();
  });

  it("ignores deferrals for signed-out and already complete providers", () => {
    expect(settingUpProviders(accounts, { tension: { initialDone: false }, decoy: { initialDone: true } }, { tension: true, decoy: true, grasshopper: true })).toEqual(["tension"]);
    expect(pendingProvider({ decoy: {} }, unfinished, { tension: true })).toBe("decoy");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withTimeout } from "./timeout";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("withTimeout", () => {
  it("returns the value when it arrives in time", async () => {
    await expect(withTimeout(Promise.resolve(7), 1000, 0)).resolves.toBe(7);
  });

  it("gives up on a promise that never settles", async () => {
    const stuck = withTimeout(new Promise<number>(() => {}), 1000, -1);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(stuck).resolves.toBe(-1);
  });

  it("treats a rejection as the fallback, and a late answer is ignored", async () => {
    await expect(withTimeout(Promise.reject(new Error("no fix")), 1000, null)).resolves.toBeNull();
    let late!: (v: number) => void;
    const slow = withTimeout(new Promise<number>((r) => { late = r; }), 1000, -1);
    await vi.advanceTimersByTimeAsync(1000);
    late(5);
    await expect(slow).resolves.toBe(-1);
  });
});

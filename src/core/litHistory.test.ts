import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "./db";
import { groupLitByDay, isRepeatLit, litTime, LIT_MAX_ENTRIES, type LitEntry } from "./litHistory";
import { clearLit, loadLit, saveLit } from "./litLocal";
import { ensureLocalSchema } from "./logicalCircuits";
import { openNodeDb } from "./nodeDb";

const e = (over: Partial<LitEntry> = {}): LitEntry => ({ id: "1", provider: "tension", climbUuid: "C1", climbName: "Pizza Box", boardId: "b1", boardName: "Home", angle: 40, litAt: "2026-11-10 18:00:00", ...over });

describe("repeat lighting", () => {
  it("counts the same climb on the same board within two minutes as one", () => {
    expect(isRepeatLit(e(), { boardId: "b1", climbUuid: "C1", litAt: "2026-11-10 18:01:30" })).toBe(true);
    expect(isRepeatLit(e(), { boardId: "b1", climbUuid: "C1", litAt: "2026-11-10 18:05:00" })).toBe(false);
    expect(isRepeatLit(e(), { boardId: "b2", climbUuid: "C1", litAt: "2026-11-10 18:00:30" })).toBe(false);
    expect(isRepeatLit(e(), { boardId: "b1", climbUuid: "C2", litAt: "2026-11-10 18:00:30" })).toBe(false);
    expect(isRepeatLit(undefined, { boardId: "b1", climbUuid: "C1", litAt: "2026-11-10 18:00:30" })).toBe(false);
  });
});

describe("grouping by day", () => {
  const now = new Date(2026, 10, 10, 20, 0, 0);
  it("labels today and yesterday and dates older days, newest first", () => {
    const days = groupLitByDay([e({ id: "a", litAt: "2026-11-10 19:00:00" }), e({ id: "b", litAt: "2026-11-10 09:00:00" }), e({ id: "c", litAt: "2026-11-09 21:00:00" }), e({ id: "d", litAt: "2026-11-03 10:00:00" }), e({ id: "f", litAt: "2025-12-25 10:00:00" })], now);
    expect(days.map((d) => d.label)).toEqual(["Today", "Yesterday", "Tue 3 Nov", "Thu 25 Dec 2025"]);
    expect(days[0].entries.map((x) => x.id)).toEqual(["a", "b"]);
  });
  it("formats the time of day on a 12-hour clock", () => {
    expect(litTime("2026-11-10 00:05:00")).toBe("12:05 AM");
    expect(litTime("2026-11-10 13:30:00")).toBe("1:30 PM");
  });
});

describe("storage", () => {
  let db: Db;
  beforeEach(async () => { db = openNodeDb(); await ensureLocalSchema(db); });
  it("keeps entries newest first, can be cleared, and trims the oldest past the limit", async () => {
    await saveLit(db, e({ id: "a", litAt: "2026-11-10 10:00:00" }));
    await saveLit(db, e({ id: "b", litAt: "2026-11-10 12:00:00" }));
    expect((await loadLit(db)).map((x) => x.id)).toEqual(["b", "a"]);
    expect((await loadLit(db))[0]).toEqual(e({ id: "b", litAt: "2026-11-10 12:00:00" }));
    await clearLit(db);
    expect(await loadLit(db)).toEqual([]);
    await db.run("INSERT INTO l_lit_history (id, provider, climb_id, climb_name, board_id, board_name, angle, lit_at) SELECT 'x' || value, 'tension', 'C', 'n', 'b', 'B', 40, '2026-01-01 00:00:00' FROM (WITH RECURSIVE s(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM s WHERE value < ?) SELECT value FROM s)", [LIT_MAX_ENTRIES + 5]);
    await saveLit(db, e({ id: "newest", litAt: "2026-11-11 00:00:00" }));
    const all = await loadLit(db, LIT_MAX_ENTRIES + 50);
    expect(all).toHaveLength(LIT_MAX_ENTRIES);
    expect(all[0].id).toBe("newest");
  });
});

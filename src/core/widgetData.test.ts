import { describe, expect, it } from "vitest";
import { buildSnapshot, EMPTY_SNAPSHOT, parseSnapshot, widgetView, type SnapshotInput } from "./widgetData";

const TODAY = "2026-11-12"; // a Thursday
const input = (over: Partial<SnapshotInput> = {}): SnapshotInput => ({ today: TODAY, now: new Date("2026-11-12T10:00:00Z"), entries: [], plan: [], goal: null, ...over });
const e = (day: string, send = true, counts = true) => ({ day, send, counts });

describe("widget snapshot", () => {
  it("keeps climbing days and the last two weeks of sends, and drops the rest", () => {
    const s = buildSnapshot(input({ entries: [e("2026-11-12"), e("2026-11-12"), e("2026-11-10", false), e("2026-10-01"), e("2020-01-01"), e("2026-11-20")] }));
    expect(s.climbingDays).toEqual(["2026-11-12", "2026-11-10", "2026-10-01"]);
    expect(s.sends).toEqual({ "2026-11-12": 2 });
  });
  it("round-trips, and reads a bad file as empty", () => {
    const s = buildSnapshot(input({ entries: [e("2026-11-12")], goal: { title: "10 V4s", progress: 0.7, summary: "7 of 10" } }));
    expect(parseSnapshot(JSON.stringify(s))).toEqual(s);
    for (const bad of [null, "", "nope", "[]", '{"v":2}']) expect(parseSnapshot(bad)).toEqual(EMPTY_SNAPSHOT);
  });
  it("drops malformed parts of a stored snapshot but keeps the good ones", () => {
    const text = JSON.stringify({ v: 1, writtenAt: "x", climbingDays: ["2026-11-12", "nope", 5], sends: { "2026-11-12": 3, bad: 1, "2026-11-11": -1 }, plan: [{ id: "a" }, { id: "b", day: "2026-11-12", title: "T", minutes: 30, status: "planned" }], goal: { title: 1 } });
    const s = parseSnapshot(text);
    expect(s.climbingDays).toEqual(["2026-11-12"]);
    expect(s.sends).toEqual({ "2026-11-12": 3 });
    expect(s.plan).toHaveLength(1);
    expect(s.goal).toBeNull();
  });
});

describe("what a widget shows", () => {
  const snap = buildSnapshot(input({
    entries: [e("2026-11-12"), e("2026-11-11"), e("2026-11-09"), e("2026-11-07")],
    plan: [{ id: "p1", day: TODAY, title: "Pull and core", minutes: 40, status: "planned" }],
  }));
  it("reads the streak and the week", () => {
    const v = widgetView(snap, TODAY);
    expect(v.streak.current).toBeGreaterThan(0);
    expect(v.streak.state).toBe("today");
    expect(v.week.dots).toHaveLength(7);
    expect(v.week.sends).toBe(3);
  });
  it("offers today's planned session, then 'done', then rest, and says nothing without a plan", () => {
    expect(widgetView(snap, TODAY).today).toMatchObject({ kind: "session", title: "Pull and core", sessionId: "p1" });
    const done = { ...snap, plan: [{ ...snap.plan[0], status: "done" as const }] };
    expect(widgetView(done, TODAY).today).toMatchObject({ kind: "done", sessionId: null });
    expect(widgetView(snap, "2026-11-13").today.kind).toBe("rest");
    expect(widgetView({ ...snap, plan: [] }, TODAY).today.kind).toBe("none");
  });
  it("moves on with the clock without a new snapshot: a week later the old sends are not counted", () => {
    expect(widgetView(snap, "2026-11-19").week.sends).toBe(0);
  });
});

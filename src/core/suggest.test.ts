import { describe, expect, it } from "vitest";
import { hardestGrade, suggest, workingGrade, type BoardCandidates, type StyleSet } from "./suggest";
import type { AngleStat, Climb, LogEntry } from "./types";

const mk = (uuid: string): Climb => ({ uuid, layoutId: 10, name: uuid, setter: "s", frames: "", frameCount: 1, pace: 1000, noMatch: false, createdAt: "2020", left: 0, right: 1, bottom: 0, top: 1 });
/** Shared grade of a "tension" difficulty: 10 is V0, 2 steps per V. Entries from "moon" are 1 per V from 100. */
const logGrade = (e: LogEntry) => (e.provider === "moon" ? e.difficulty - 100 : (e.difficulty - 10) / 2);
const NOW = new Date(2026, 9, 31, 12);
const send = (difficulty: number, when = "2026-10-20 10:00:00", uuid = "x" + difficulty, provider = "tension"): LogEntry => ({ id: uuid + when, provider, climbUuid: uuid, climbName: uuid, angle: 40, isMirror: false, bidCount: 1, quality: 3, difficulty, comment: "", climbedAt: when, isSend: true });
const stat = (d: number, n = 50, q = 3): AngleStat => [d, null, n, q];

const board = (over: Partial<BoardCandidates> & { climbs: Climb[]; stats: Map<string, AngleStat> }): BoardCandidates => ({
  key: "b1", name: "Home", provider: "tension", done: () => undefined, blocked: () => false, liked: () => false, gradeOf: (d) => (d - 10) / 2, ...over,
});
const run = (boards: BoardCandidates[], logbook: LogEntry[] = V3, extra: Record<string, unknown> = {}) => suggest({ boards, logbook, logGrade, now: NOW, ...extra });
const V3 = [send(16), send(16, "2026-10-21 10:00:00", "b"), send(16, "2026-10-22 10:00:00", "c")]; // shared grade 3

describe("workingGrade", () => {
  it("averages the three hardest recent graded sends on the shared scale", () => {
    expect(workingGrade([send(14), send(16), send(18), send(12)], NOW, logGrade)).toBeCloseTo((2 + 3 + 4) / 3);
  });
  it("is null with fewer than three graded sends", () => {
    expect(workingGrade([send(14), send(0), send(16)], NOW, logGrade)).toBeNull();
  });
  it("falls back to older sends when the last 90 days are thin", () => {
    expect(workingGrade([send(14, "2025-01-01 10:00:00"), send(16, "2025-01-02 10:00:00"), send(18, "2025-01-03 10:00:00"), send(10)], NOW, logGrade)).toBeCloseTo(3);
  });
  it("blends providers: a moon V5 counts the same as a tension V5", () => {
    const mixed = [send(20, "2026-10-20 10:00:00", "t1"), send(105, "2026-10-21 10:00:00", "m1", "moon"), send(105, "2026-10-22 10:00:00", "m2", "moon")];
    expect(workingGrade(mixed, NOW, logGrade)).toBe(5);
  });
});

describe("suggest, one board", () => {
  const climbs = ["warm", "range", "reach", "far", "sent", "blocked", "thin", "bad"].map(mk);
  const stats = new Map<string, AngleStat>([
    ["warm", stat(13)], ["range", stat(16)], ["reach", stat(18)], ["far", stat(26)], ["sent", stat(16)], ["blocked", stat(16)], ["thin", stat(16, 2)], ["bad", stat(16, 50, 1.5)],
  ]);
  const b = (over: Partial<BoardCandidates> = {}) => board({ climbs, stats, done: (u) => (u === "sent" ? "sent" : undefined), blocked: (u) => u === "blocked", ...over });

  it("groups climbs around your working grade and skips sent, blocked, thin and badly rated ones", () => {
    const g = Object.fromEntries(run([b()]).map((x) => [x.key, x.items.map((i) => i.climb.uuid)]));
    expect(g.warmup).toEqual(["warm"]);
    expect(g.range).toEqual(["range"]);
    expect(g.push).toEqual(["reach"]);
    expect(JSON.stringify(g)).not.toMatch(/far|sent|blocked|thin|bad/);
  });
  it("offers climbs you tried but have not sent, even a grade above your range", () => {
    const tried = b({ done: (u) => (u === "reach" ? "tried" : undefined) });
    expect(run([tried]).find((x) => x.key === "unfinished")?.items.map((i) => i.climb.uuid)).toEqual(["reach"]);
    expect(run([tried]).find((x) => x.key === "push")).toBeUndefined();
  });
  it("without enough graded sends it suggests easy, well-loved climbs to start", () => {
    const g = run([b()], []);
    expect(g.map((x) => x.key)).toEqual(["start"]);
    expect(g[0].items.map((i) => i.climb.uuid).sort()).toEqual(["range", "warm"]);
  });
  it("is stable within a day", () => {
    const many = Array.from({ length: 30 }, (_, i) => mk("m" + i));
    const st = new Map<string, AngleStat>(many.map((c) => [c.uuid, stat(16)]));
    const once = () => run([board({ climbs: many, stats: st })])[0].items.map((i) => i.climb.uuid);
    expect(once()).toEqual(once());
  });
});

describe("suggest, across boards", () => {
  const many = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => mk(`${prefix}${i}`));
  const stats = (cs: Climb[], d: number) => new Map<string, AngleStat>(cs.map((c) => [c.uuid, stat(d)]));

  it("uses one working grade from the merged logbook and tags each suggestion with its board", () => {
    const t = many("t", 3), m = many("m", 3);
    const g = run([
      board({ key: "tb", name: "Tension", climbs: t, stats: stats(t, 16) }),
      board({ key: "mb", name: "Moon", provider: "moon", climbs: m, stats: stats(m, 103), gradeOf: (d) => d - 100 }),
    ]);
    const range = g.find((x) => x.key === "range")!;
    expect(new Set(range.items.map((i) => i.boardKey))).toEqual(new Set(["tb", "mb"]));
    expect(range.items.every((i) => i.grade === 3)).toBe(true);
  });
  it("grades a moon send and a tension send on the same footing when finding your range", () => {
    const m = many("m", 2), t = many("t", 2);
    const logs = [send(105, "2026-10-20 10:00:00", "a", "moon"), send(105, "2026-10-21 10:00:00", "b", "moon"), send(20, "2026-10-22 10:00:00", "c")]; // all V5
    const g = run([
      board({ key: "tb", name: "Tension", climbs: t, stats: stats(t, 20) }),
      board({ key: "mb", name: "Moon", provider: "moon", climbs: m, stats: stats(m, 105), gradeOf: (d) => d - 100 }),
    ], logs);
    expect(g.find((x) => x.key === "range")?.items).toHaveLength(4);
  });
  it("keeps one board from filling a group", () => {
    const t = many("t", 20), m = many("m", 2);
    const g = run([
      board({ key: "tb", name: "Tension", climbs: t, stats: stats(t, 16) }),
      board({ key: "mb", name: "Moon", provider: "moon", climbs: m, stats: stats(m, 103), gradeOf: (d) => d - 100 }),
    ]);
    const range = g.find((x) => x.key === "range")!;
    expect(range.items.filter((i) => i.boardKey === "tb").length).toBeLessThanOrEqual(5);
    expect(range.items.some((i) => i.boardKey === "mb")).toBe(true);
  });
  it("uses each board's own done and blocked state", () => {
    const a = [mk("same")], b2 = [mk("same")];
    const g = run([
      board({ key: "b1", name: "One", climbs: a, stats: stats(a, 16), done: () => "sent" }),
      board({ key: "b2", name: "Two", climbs: b2, stats: stats(b2, 16) }),
    ]);
    expect(g.flatMap((x) => x.items).map((i) => i.boardKey)).toEqual(["b2"]);
  });
});

describe("a board with no community data", () => {
  const cs = ["a", "b", "c"].map(mk);
  const none = new Map<string, AngleStat>(cs.map((c) => [c.uuid, stat(16, 0, 0)])); // a grade only: no sends, no rating
  it("is not held to the send and rating minimums, which would leave a MoonBoard with nothing", () => {
    expect(run([board({ climbs: cs, stats: none })]).flatMap((x) => x.items)).toHaveLength(0);
    const g = run([board({ climbs: cs, stats: none, community: false })]);
    expect(g.find((x) => x.key === "range")?.items.map((i) => i.climb.uuid).sort()).toEqual(["a", "b", "c"]);
    expect(g.flatMap((x) => x.items).every((i) => /problem/i.test(i.reason))).toBe(true);
  });
  it("still skips blocked and sent problems, and leads with benchmarks", () => {
    const withBench = new Map(none);
    withBench.set("b", [16, 16, 0, 0]); // benchmark difficulty set
    const g = run([board({ climbs: cs, stats: withBench, community: false, blocked: (u) => u === "a", done: (u) => (u === "c" ? "sent" : undefined) })]);
    expect(g.flatMap((x) => x.items.map((i) => i.climb.uuid))).toEqual(["b"]);
  });
});

describe("hardestGrade", () => {
  it("is the hardest recent graded send, and counts off-board evidence", () => {
    expect(hardestGrade([send(14), send(16), send(18), send(12)], NOW, logGrade)).toBe(4);
    expect(hardestGrade([send(14), send(16), send(18)], NOW, logGrade, [{ grade: 6.5, climbedAt: "2026-10-25 10:00:00" }])).toBe(6.5);
    expect(hardestGrade([send(14), send(16)], NOW, logGrade)).toBeNull();
  });
  it("lets off-board sends lift the working grade", () => {
    const extra = [4, 4, 4].map((grade) => ({ grade, climbedAt: "2026-10-25 10:00:00" }));
    expect(workingGrade(V3, NOW, logGrade, extra)).toBe(4);
  });
});

describe("push, for you and antistyle", () => {
  const many = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => mk(`${prefix}${i}`));
  const stats = (cs: Climb[], d: number) => new Map<string, AngleStat>(cs.map((c) => [c.uuid, stat(d)]));

  it("pushes climbs above the hardest send, up to one V grade ahead, and not further", () => {
    const logs = [send(16), send(16, "2026-10-21 10:00:00", "b"), send(20, "2026-10-22 10:00:00", "c")]; // hardest V5, working 3.67
    const cs = ["same", "ahead", "tooFar"].map(mk);
    const st = new Map<string, AngleStat>([["same", stat(20)], ["ahead", stat(22)], ["tooFar", stat(26)]]);
    const g = run([board({ climbs: cs, stats: st })], logs);
    expect(g.find((x) => x.key === "push")?.items.map((i) => i.climb.uuid)).toEqual(["ahead"]);
  });

  const style = (label: string, climbs: Climb[], d: number, angle: number, aim: number | null = null): StyleSet => ({ label, boards: [board({ climbs, stats: stats(climbs, d), angle })], aim });

  it("offers For you at your level in your main angle and Antistyle a notch lower in the opposite one, tagged with their angle", () => {
    const slab = many("slab", 3), steep = many("steep", 3);
    const g = run([board({ climbs: [], stats: new Map() })], V3, { forYou: style("slab", slab, 16, 0), anti: style("steep", steep, 14, 45) });
    const fy = g.find((x) => x.key === "foryou")!;
    const anti = g.find((x) => x.key === "anti")!;
    expect(fy.items.map((i) => i.climb.uuid).sort()).toEqual(["slab0", "slab1", "slab2"]);
    expect(fy.items.every((i) => i.set === "foryou" && i.angle === 0)).toBe(true);
    expect(anti.items.every((i) => i.set === "anti" && i.angle === 45)).toBe(true);
    expect(fy.blurb).toMatch(/^Slab/);
    expect(anti.blurb).toMatch(/^Steep/);
  });
  it("aims the Antistyle group at the grade it is told, else a V grade under your working grade", () => {
    const steep = many("steep", 3);
    const low = run([board({ climbs: [], stats: new Map() })], V3, { anti: style("steep", steep, 12, 45) }); // V1
    expect(low.find((x) => x.key === "anti")?.items.length).toBe(3);
    const none = run([board({ climbs: [], stats: new Map() })], V3, { anti: style("steep", steep, 16, 45) }); // V3, above the aim
    expect(none.find((x) => x.key === "anti")).toBeUndefined();
    const aimed = run([board({ climbs: [], stats: new Map() })], V3, { anti: style("steep", steep, 16, 45, 3) });
    expect(aimed.find((x) => x.key === "anti")?.items.length).toBe(3);
  });
  it("shows a climb in one group only", () => {
    const cs = many("c", 4);
    const g = run([board({ climbs: cs, stats: stats(cs, 16) })], V3, { forYou: { label: "vertical", boards: [board({ climbs: cs, stats: stats(cs, 16), angle: 0 })], aim: null } });
    const ids = g.flatMap((x) => x.items.map((i) => `${i.boardKey}:${i.climb.uuid}`));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("leaves the style groups out when your style is not known", () => {
    const keys = run([board({ climbs: many("c", 4), stats: stats(many("c", 4), 16) })]).map((x) => x.key);
    expect(keys).not.toContain("foryou");
    expect(keys).not.toContain("anti");
  });
});

import { describe, expect, it } from "vitest";
import { attemptWindows, durationText, sessionLines, timedSessions, ATTEMPT, type AttemptInput, type LitPoint } from "./attempts";
import { parseStamp } from "./days";

const at = (hms: string, day = "2026-11-12") => `${day} ${hms}`;
const ms = (hms: string, day = "2026-11-12") => parseStamp(at(hms, day)).getTime();
let n = 0;
const log = (hms: string, climb: string, over: Partial<AttemptInput> = {}): AttemptInput => ({ id: `e${n++}`, provider: "tension", climbUuid: climb, climbedAt: at(hms), bidCount: 1, isSend: true, ...over });
const lit = (hms: string, climb: string, provider = "tension"): LitPoint => ({ provider, climbUuid: climb, litAt: at(hms) });

describe("a window exists only for a logged entry", () => {
  it("makes nothing from lighting alone", () => {
    expect(attemptWindows([], [lit("18:00:00", "A"), lit("18:01:00", "B")])).toEqual([]);
  });
  it("ignores a climb lit for someone else and never logged, and the run of climbs swiped through", () => {
    const swiped = ["A", "B", "C", "D", "E"].map((c, i) => lit(`18:0${i}:00`, c));
    const w = attemptWindows([log("18:12:00", "F")], [...swiped, lit("18:10:00", "F")]);
    expect(w).toHaveLength(1);
    expect(w[0].climbUuid).toBe("F");
  });
});

describe("bounds from lighting", () => {
  it("starts at the lighting of that climb and ends at the log", () => {
    const [w] = attemptWindows([log("18:05:00", "A")], [lit("18:02:00", "A")]);
    expect(w).toMatchObject({ quality: "bounded", start: ms("18:02:00"), end: ms("18:05:00") });
  });
  it("is an estimate when the climb was never lit", () => {
    const [w] = attemptWindows([log("18:05:00", "A")], []);
    expect(w.quality).toBe("estimated");
    expect(w.end - w.start).toBe(ATTEMPT.defaultPerTrySeconds * 1000);
  });
  it("is an estimate when another climb was lit after it, because the board showed something else", () => {
    const [w] = attemptWindows([log("18:08:00", "A")], [lit("18:02:00", "A"), lit("18:04:00", "B")]);
    expect(w.quality).toBe("estimated");
  });
  it("counts a re-lighting after swiping on", () => {
    const [w] = attemptWindows([log("18:09:00", "A")], [lit("18:02:00", "A"), lit("18:04:00", "B"), lit("18:06:00", "A")]);
    expect(w).toMatchObject({ quality: "bounded", start: ms("18:06:00") });
  });
  it("does not trust a lighting from long before the log", () => {
    const [w] = attemptWindows([log("18:30:00", "A")], [lit("18:02:00", "A")]);
    expect(w.quality).toBe("estimated");
  });
  it("a climb lit before the previous entry was logged cannot start before that entry", () => {
    const ws = attemptWindows([log("18:05:00", "A"), log("18:09:00", "B")], [lit("18:01:00", "A"), lit("18:04:00", "B")]);
    expect(ws[1]).toMatchObject({ quality: "bounded", start: ms("18:05:00"), end: ms("18:09:00") });
  });
  it("matches the climb on its own provider only", () => {
    const [w] = attemptWindows([log("18:05:00", "A", { provider: "moon" })], [lit("18:02:00", "A", "tension")]);
    expect(w.quality).toBe("estimated");
  });
});

describe("tries", () => {
  it("stretches an estimate with the tries, up to a limit", () => {
    const [one] = attemptWindows([log("18:05:00", "A", { bidCount: 1 })], []);
    const [three] = attemptWindows([log("18:05:00", "A", { bidCount: 3 })], []);
    const [many] = attemptWindows([log("18:05:00", "A", { bidCount: 30 })], []);
    expect((three.end - three.start) / (one.end - one.start)).toBe(3);
    expect((many.end - many.start) / 1000).toBe(ATTEMPT.estimateTriesCap * ATTEMPT.defaultPerTrySeconds);
    expect(three.tries).toBe(3);
  });
  it("learns what a try usually takes from bounded windows, from their lower quarter", () => {
    const entries = [log("18:03:00", "A"), log("18:08:00", "B"), log("18:14:00", "C"), log("18:30:00", "D")];
    const points = [lit("18:01:00", "A"), lit("18:05:00", "B"), lit("18:10:00", "C")];
    const ws = attemptWindows(entries, points);
    // Bounded per-try times are 120, 180 and 240 seconds; the lower quarter is 120.
    expect(ws.slice(0, 3).every((w) => w.quality === "bounded")).toBe(true);
    expect(ws[3].quality).toBe("estimated");
    expect((ws[3].end - ws[3].start) / 1000).toBe(120);
  });
  it("keeps every window at least the shortest length when entries share a time", () => {
    const ws = attemptWindows([log("18:05:00", "A"), log("18:05:00", "B")], []);
    for (const w of ws) expect(w.end - w.start).toBeGreaterThanOrEqual(ATTEMPT.minWindowSeconds * 1000);
  });
});

describe("sessions", () => {
  const entries = [log("18:03:00", "A"), log("18:10:00", "B"), log("18:13:00", "B", { bidCount: 2 }), log("20:30:00", "C")];
  const points = [lit("18:01:00", "A"), lit("18:08:00", "B"), lit("18:11:00", "B")];
  const ws = attemptWindows(entries, points);
  const sessions = timedSessions(ws);

  it("splits at a long gap, oldest first", () => {
    expect(sessions).toHaveLength(2);
    expect(sessions[0].windows).toHaveLength(3);
    expect(sessions[1].windows).toHaveLength(1);
    expect(sessions[0].start).toBeLessThan(sessions[1].start);
  });
  it("summarises one session", () => {
    const s = sessions[0];
    expect(s).toMatchObject({ climbs: 2, tries: 4 });
    expect(s.spanSeconds).toBe((ms("18:13:00") - ms("18:01:00")) / 1000);
    expect(s.activeSeconds).toBeLessThanOrEqual(s.spanSeconds);
    expect(s.restSeconds).not.toBeNull();
    expect(s.triesPerHour).toBeCloseTo(4 / (s.spanSeconds / 3600));
    expect(s.boundedShare).toBe(1);
  });
  it("names the climb that took the most time when it was tried more than once", () => {
    expect(sessions[0].project).toMatchObject({ climbUuid: "B", tries: 3 });
    expect(sessions[1].project).toBeNull();
  });
  it("counts overlapping windows once", () => {
    const overlapping = attemptWindows([log("18:05:00", "A"), log("18:05:00", "B")], []);
    const s = timedSessions(overlapping)[0];
    expect(s.activeSeconds).toBeLessThanOrEqual((s.end - s.start) / 1000);
  });
  it("gives no rate for a very short session", () => {
    expect(timedSessions(attemptWindows([log("18:05:00", "A")], []))[0].triesPerHour).toBeNull();
  });
});

describe("wording", () => {
  it("writes durations briefly", () => {
    expect(durationText(40)).toBe("40 s");
    expect(durationText(150)).toBe("3 min");
    expect(durationText(3 * 3600 + 5 * 60)).toBe("3 h 05 min");
    expect(durationText(-5)).toBe("0 s");
  });
});

describe("session wording", () => {
  const entries = [log("18:03:00", "A"), log("18:10:00", "B"), log("18:13:00", "B", { bidCount: 2 })];
  const s = timedSessions(attemptWindows(entries, [lit("18:01:00", "A"), lit("18:08:00", "B"), lit("18:11:00", "B")]))[0];
  const names = (id: string) => ({ A: "Pizza Box", B: "Aw, shoot" } as Record<string, string>)[id] ?? null;

  it("always says about, and names the project", () => {
    const l = sessionLines(s, names);
    expect(l.headline).toBe("About 12 min on the board \u00B7 2 climbs");
    expect(l.details[0]).toBe("4 tries on 2 climbs");
    expect(l.details.some((d) => d.startsWith("Most time on Aw, shoot: about"))).toBe(true);
    expect(l.note).toBeNull();
  });
  it("leaves out the project line when the climb has no name, and a rate for a short session", () => {
    const l = sessionLines(s, () => null);
    expect(l.details.some((d) => d.startsWith("Most time"))).toBe(false);
    expect(l.details.some((d) => d.includes("an hour"))).toBe(true);
  });
  it("says the times are estimated when most windows are", () => {
    const est = timedSessions(attemptWindows([log("18:03:00", "A"), log("18:10:00", "B")], []))[0];
    expect(sessionLines(est, names).note).toBe("Estimated from when you logged.");
  });
  it("uses the singular", () => {
    const one = timedSessions(attemptWindows([log("18:05:00", "A")], [lit("18:02:00", "A")]))[0];
    expect(sessionLines(one, names).headline).toBe("About 3 min on the board \u00B7 1 climb");
    expect(sessionLines(one, names).details[0]).toBe("1 try on 1 climb");
  });
});

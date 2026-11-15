import { describe, expect, it } from "vitest";
import { describeCapabilities, parseInbox, parseInboxLine, watchStatusText } from "./wear";

const line = (path: string, body: unknown) => JSON.stringify({ path, data: JSON.stringify(body), at: 1 });

describe("watch messages", () => {
  it("reads a state change and a pong apart", () => {
    const body = { state: "running", session: "s1", startedAt: 1_700_000_000_000, bpm: 91.4 };
    expect(parseInboxLine(line("/slackboard/state", body))).toMatchObject({ kind: "state", pong: false, state: "running", bpm: 91 });
    expect(parseInboxLine(line("/slackboard/pong", { state: "idle", session: null, startedAt: null, bpm: null }))).toMatchObject({
      kind: "state",
      pong: true,
      state: "idle",
      session: null,
    });
  });

  it("keeps the good samples of a batch and drops dropouts and wild values", () => {
    const m = parseInboxLine(line("/slackboard/hr", { session: "s1", t: [1000, 2000, 3000, 4000], b: [88, 0, 300, 92.2] }));
    expect(m).toEqual({
      kind: "hr",
      session: "s1",
      samples: [
        { at: 1000, bpm: 88 },
        { at: 4000, bpm: 92 },
      ],
    });
  });

  it("refuses batches whose arrays disagree, or that are too large", () => {
    expect(parseInboxLine(line("/slackboard/hr", { session: "s1", t: [1, 2], b: [80] }))).toBeNull();
    const big = Array.from({ length: 5001 }, (_, i) => i + 1);
    expect(parseInboxLine(line("/slackboard/hr", { session: "s1", t: big, b: big.map(() => 80) }))).toBeNull();
  });

  it("reads a summary, with calories optional, and refuses an end before the start", () => {
    expect(parseInboxLine(line("/slackboard/summary", { session: "s1", startedAt: 1000, endedAt: 5000, calories: null }))).toMatchObject({
      kind: "summary",
      calories: null,
    });
    expect(parseInboxLine(line("/slackboard/summary", { session: "s1", startedAt: 1000, endedAt: 5000, calories: 212.34 }))).toMatchObject({
      calories: 212.3,
    });
    expect(parseInboxLine(line("/slackboard/summary", { session: "s1", startedAt: 5000, endedAt: 1000, calories: 1 }))).toBeNull();
  });

  it("counts what cannot be read instead of throwing", () => {
    const r = parseInbox(["not json", line("/slackboard/other", {}), JSON.stringify({ path: 1 }), line("/slackboard/state", { state: "nope" })]);
    expect(r.messages).toEqual([]);
    expect(r.skipped).toBe(4);
  });
});

describe("watchStatusText", () => {
  it("says what is known", () => {
    expect(watchStatusText({ reachable: null, running: false, bpm: null })).toBe("Not checked");
    expect(watchStatusText({ reachable: false, running: false, bpm: null })).toBe("No watch with Slackboard found");
    expect(watchStatusText({ reachable: true, running: true, bpm: 120 })).toBe("Recording, 120 bpm");
  });
});

describe("the watch's capabilities report", () => {
  const body = { model: "SM-R940", sdk: 36, workout: ["HEART_RATE_BPM", "CALORIES_TOTAL"], measure: ["HEART_RATE_BPM"], passive: [], sensors: ["accelerometer", "pressure"], samsungSensors: false, errors: [] };

  it("is read into lists, and written out as plain text", () => {
    const m = parseInboxLine(line("/slackboard/capabilities", body));
    expect(m).toMatchObject({ kind: "capabilities", capabilities: { model: "SM-R940", sdk: 36, workout: ["HEART_RATE_BPM", "CALORIES_TOTAL"], samsungSensors: false } });
    if (m?.kind !== "capabilities") throw new Error("not a capabilities message");
    const text = describeCapabilities(m.capabilities);
    expect(text).toContain("Watch: SM-R940, Android API 36");
    expect(text).toContain("Workout data (climbing): HEART_RATE_BPM, CALORIES_TOTAL");
    expect(text).toContain("Passive monitoring: none reported");
    expect(text).toContain("Samsung health sensor service: not installed");
  });

  it("keeps what is usable: drops non-text and oversized names and too many items, and reads a missing answer as unknown", () => {
    const many = Array.from({ length: 150 }, (_, i) => `T${i}`);
    const m = parseInboxLine(line("/slackboard/capabilities", { ...body, workout: ["A", 5, "", "x".repeat(200), "B"], sensors: many, samsungSensors: "yes", sdk: "36" }));
    expect(m).toMatchObject({ capabilities: { workout: ["A", "B"], samsungSensors: null, sdk: null } });
    expect((m as { capabilities: { sensors: string[] } }).capabilities.sensors).toHaveLength(100);
  });

  it("is refused without a model", () => {
    expect(parseInboxLine(line("/slackboard/capabilities", { ...body, model: "" }))).toBeNull();
  });
});

describe("motion, elevation and workout totals", () => {
  const motion = { session: "s1", t: [1000, 2000, 3000], a: [0.4, null, 2.5], am: [1.1, null, 6], g: [0.2, 0.1, null], gm: [0.9, 0.3, null], p: [1008.2, 1008.1, null], gx: [0.1, 0.2, null], gy: [-9.7, -9.6, null], gz: [1.2, 1.3, null] };

  it("reads a second at a time, with null where a sensor gave nothing", () => {
    const m = parseInboxLine(line("/slackboard/motion", motion));
    expect(m).toMatchObject({ kind: "motion", session: "s1" });
    if (m?.kind !== "motion") throw new Error("not motion");
    expect(m.rows).toHaveLength(3);
    expect(m.rows[0]).toMatchObject({ at: 1000, accRms: 0.4, accMax: 1.1, gyroRms: 0.2, pressure: 1008.2, gy: -9.7 });
    expect(m.rows[1]).toMatchObject({ accRms: null, accMax: null, gyroRms: 0.1 });
    expect(m.rows[2]).toMatchObject({ gyroRms: null, pressure: null, gz: null });
  });

  it("drops a value that cannot be real instead of the whole batch, and refuses columns of the wrong length", () => {
    const m = parseInboxLine(line("/slackboard/motion", { ...motion, p: [50, 1008, 5000] }));
    if (m?.kind !== "motion") throw new Error("not motion");
    expect(m.rows.map((r) => r.pressure)).toEqual([null, 1008, null]);
    expect(parseInboxLine(line("/slackboard/motion", { ...motion, a: [1, 2] }))).toBeNull();
    expect(parseInboxLine(line("/slackboard/motion", { ...motion, gx: undefined }))).toBeNull();
  });

  it("reads elevation samples and skips one outside the range of the planet", () => {
    const m = parseInboxLine(line("/slackboard/elevation", { session: "s1", t: [1000, 2000, 3000], m: [120.456, 99999, -3] }));
    expect(m).toEqual({ kind: "elevation", session: "s1", samples: [{ at: 1000, metres: 120.46 }, { at: 3000, metres: -3 }] });
    expect(parseInboxLine(line("/slackboard/elevation", { session: "s1", t: [1], m: [] }))).toBeNull();
  });

  it("reads totals, treating a missing or wild one as unknown, and carries them in the summary", () => {
    const s = parseInboxLine(line("/slackboard/stats", { session: "s1", calories: 212.34, gain: 4.26, hrAvg: 101.6, hrMin: 70, hrMax: 400 }));
    expect(s).toEqual({ kind: "stats", session: "s1", stats: { calories: 212.3, gain: 4.3, hrAvg: 101.6, hrMin: 70, hrMax: null } });
    const sum = parseInboxLine(line("/slackboard/summary", { session: "s1", startedAt: 1000, endedAt: 9000, calories: null, gain: 3, hrAvg: 99, hrMin: 60, hrMax: 140 }));
    expect(sum).toEqual({ kind: "summary", session: "s1", startedAt: 1000, endedAt: 9000, calories: null, gain: 3, hrAvg: 99, hrMin: 60, hrMax: 140 });
  });
});

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

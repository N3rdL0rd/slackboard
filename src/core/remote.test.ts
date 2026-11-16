import { describe, expect, it } from "vitest";
import { buildAck, buildRemoteState, buildSummary, climbFace, CLIMB_TIMER_STEPS, isStale, parseCommand, splitInbox, REMOTE_VERSION, watchIsOpen, WATCH_OPEN_MS, type ClimbFacts } from "./remote";

const band = (over = {}) => ({ name: "green", fill: "#4FD08A", text: "#101416", border: "#4FD08A", borderWidth: 0, bar: "#4FD08A", ...over });
const facts = (over: Partial<ClimbFacts> = {}): ClimbFacts => ({
  id: "U1", name: "Masquerade", setter: "n3rd", difficulty: 20, grade: "V4", alt: "6b+", band: band(), angle: 40, mirrored: false, canMirror: true,
  quality: 2.6, sends: 214, classic: true, index: 6, count: 24, ...over,
});
const cmd = (over: Record<string, unknown>) => ({ v: REMOTE_VERSION, id: "c1", ...over });

describe("the climb as the watch shows it", () => {
  it("colours the numeral like the phone's grade chip, including the black bands", () => {
    expect(climbFace(facts()).numeral).toBe("#4FD08A");
    const black = climbFace(facts({ band: band({ fill: "#050607", text: "#EDEBE4", borderWidth: 1.5, bar: "#8E9795" }) }));
    expect(black).toMatchObject({ numeral: "#EDEBE4", ring: "#8E9795" });
  });
  it("rounds stars to whole stars and says nothing for an unrated climb", () => {
    expect(climbFace(facts({ quality: 2.6 })).stars).toBe(3);
    expect(climbFace(facts({ quality: 1.4 })).stars).toBe(1);
    expect(climbFace(facts({ quality: 0 })).stars).toBeNull();
    expect(climbFace(facts({ quality: null })).stars).toBeNull();
  });
  it("shortens a name too long for a round screen and keeps a project's missing grade", () => {
    expect(climbFace(facts({ name: "x".repeat(200) })).name.length).toBeLessThanOrEqual(60);
    const p = climbFace(facts({ grade: null, alt: null, band: null }));
    expect(p).toMatchObject({ grade: null, numeral: "#EDEBE4" });
  });
});

describe("the state message", () => {
  const base = { now: 1_000_000, climb: climbFace(facts()), timerEnd: null, timerLen: 60, runner: null, board: { name: "Home", connected: true } };
  it("carries the version and the clock it was built at, with no timer unless one runs", () => {
    const s = buildRemoteState(base);
    expect(s).toMatchObject({ v: REMOTE_VERSION, at: 1_000_000, timer: null, lastLength: 60 });
    expect(s.lengths).toEqual(CLIMB_TIMER_STEPS);
  });
  it("sends the time left, not an end time, so a watch with a different clock still counts right", () => {
    expect(buildRemoteState({ ...base, timerEnd: 1_026_000 }).timer).toEqual({ left: 26_000, length: 60 });
    expect(buildRemoteState({ ...base, timerEnd: 999_000 }).timer?.left).toBe(0);
  });
  it("builds a summary with whole, non-negative numbers", () => {
    expect(buildSummary({ streak: 3.9, streakState: "today", today: null, week: -2 })).toMatchObject({ streak: 3, week: 0, today: null, v: REMOTE_VERSION });
  });
});

describe("commands from the watch", () => {
  it("accepts the plain commands and reads the ones that carry a value", () => {
    expect(parseCommand(cmd({ cmd: "next" }))).toEqual({ ok: true, id: "c1", command: { cmd: "next" } });
    expect(parseCommand(cmd({ cmd: "timer-start", length: 120 }))).toMatchObject({ ok: true, command: { cmd: "timer-start", length: 120 } });
    expect(parseCommand(cmd({ cmd: "log", send: true, tries: 2 }))).toMatchObject({ ok: true, command: { cmd: "log", send: true, tries: 2 } });
    expect(parseCommand(cmd({ cmd: "mark", kind: "attempt-start", session: "s1", at: 5 }))).toMatchObject({ ok: true, command: { cmd: "mark", kind: "attempt-start" } });
    expect(parseCommand(cmd({ cmd: "runner", op: "done" }))).toMatchObject({ ok: true, command: { cmd: "runner", op: "done" } });
  });
  it("refuses a message from another version and says so, keeping its id for the answer", () => {
    expect(parseCommand({ v: REMOTE_VERSION + 1, id: "x", cmd: "next" })).toEqual({ ok: false, reason: "version", id: "x" });
    expect(parseCommand({ id: "x", cmd: "next" })).toMatchObject({ ok: false, reason: "version" });
  });
  it("refuses values that cannot be right instead of clamping them", () => {
    for (const bad of [
      { cmd: "timer-start", length: 99999 }, { cmd: "timer-start" }, { cmd: "log", send: "yes", tries: 1 }, { cmd: "log", send: true, tries: 0 },
      { cmd: "log", send: true, tries: 1000 }, { cmd: "mark", kind: "dance", session: "s", at: 5 }, { cmd: "mark", kind: "fall", session: "", at: 5 },
      { cmd: "runner", op: "explode" }, { cmd: "unknown" }, { cmd: 7 },
    ]) expect(parseCommand(cmd(bad)), JSON.stringify(bad)).toMatchObject({ ok: false, reason: "invalid" });
    expect(parseCommand("next")).toMatchObject({ ok: false });
    expect(parseCommand(null)).toMatchObject({ ok: false });
  });
  it("lets a command that moves something expire, but not presence or a mark", () => {
    const now = 100_000;
    expect(isStale({ cmd: "next" }, now - 20_000, now)).toBe(true);
    expect(isStale({ cmd: "next" }, now - 5_000, now)).toBe(false);
    expect(isStale({ cmd: "hello" }, now - 60_000, now)).toBe(false);
    expect(isStale({ cmd: "mark", kind: "fall", session: "s", at: 1 }, now - 60_000, now)).toBe(false);
  });
});

describe("presence", () => {
  it("is open for a while after the watch last said so", () => {
    expect(watchIsOpen(null, 1000)).toBe(false);
    expect(watchIsOpen(1000, 1000 + WATCH_OPEN_MS - 1)).toBe(true);
    expect(watchIsOpen(1000, 1000 + WATCH_OPEN_MS)).toBe(false);
  });
  it("builds an answer with a bounded text", () => {
    expect(buildAck("c1", false, "y".repeat(300)).text.length).toBeLessThanOrEqual(80);
  });
});

describe("splitting the inbox", () => {
  const line = (path: string, data: unknown, at = 5) => JSON.stringify({ path, data: typeof data === "string" ? data : JSON.stringify(data), at });
  it("takes the commands out and leaves the recorder's messages in order", () => {
    const hr = line("/slackboard/hr", { session: "s" });
    const { commands, rest } = splitInbox([hr, line("/slackboard/cmd", cmd({ cmd: "next" })), "not json", line("/slackboard/state", {}), line("/slackboard/cmd", "{broken")]);
    expect(rest).toEqual([hr, "not json", line("/slackboard/state", {})]);
    expect(commands).toHaveLength(2);
    expect(commands[0]).toMatchObject({ receivedAt: 5, parsed: { ok: true, command: { cmd: "next" } } });
    expect(commands[1].parsed).toMatchObject({ ok: false, reason: "invalid" });
  });
});

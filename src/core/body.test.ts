import { describe, expect, it } from "vitest";
import type { Activity } from "./activity";
import { blankNote, fingerHoldOff, isBlankNote, nextState, noteFor, noteSummary, painNote, parseDayNote, repeatedPain, withDayEfforts, reportPain, type DayNote } from "./body";

const day = (n: number) => `2026-11-${String(n).padStart(2, "0")}`;
const note = (n: number, over: Partial<DayNote> = {}): DayNote => ({ ...blankNote(day(n)), ...over });

describe("a day's check-in", () => {
  it("is blank until something is said, and a note or a rating is something", () => {
    expect(isBlankNote(blankNote(day(1)))).toBe(true);
    expect(isBlankNote(note(1, { fingers: "sore" }))).toBe(false);
    expect(isBlankNote(note(1, { effort: 5 }))).toBe(false);
    expect(isBlankNote(note(1, { note: "  " }))).toBe(true);
    expect(isBlankNote(note(1, { note: "tired" }))).toBe(false);
  });

  it("cycles an area through fine, sore, hurts and back", () => {
    expect(nextState("fine")).toBe("sore");
    expect(nextState("sore")).toBe("hurts");
    expect(nextState("hurts")).toBe("fine");
  });

  it("finds a day's note", () => {
    expect(noteFor([note(1), note(2, { effort: 4 })], day(2))?.effort).toBe(4);
    expect(noteFor([], day(2))).toBeUndefined();
  });
});

describe("reading a note from untrusted data", () => {
  it("accepts a good record and reads a bad rating or area as not given", () => {
    expect(parseDayNote({ day: day(3), effort: 7, energy: 3, fingers: "sore", elbows: "hurts", shoulders: "fine", other: "fine", note: "ok" }))
      .toEqual({ day: day(3), effort: 7, energy: 3, fingers: "sore", elbows: "hurts", shoulders: "fine", other: "fine", note: "ok" });
    expect(parseDayNote({ day: day(3), effort: 11, energy: 0, fingers: "broken", note: "" })).toEqual(blankNote(day(3)));
    expect(parseDayNote({ day: day(3), effort: 5.5, energy: "3", note: "" })).toEqual(blankNote(day(3)));
  });

  it("refuses a record with no real day or a note that isn't text or is far too long", () => {
    expect(parseDayNote(null)).toBeNull();
    expect(parseDayNote([])).toBeNull();
    expect(parseDayNote({ note: "" })).toBeNull();
    expect(parseDayNote({ day: "2026-02-30", note: "" })).toBeNull();
    expect(parseDayNote({ day: "yesterday", note: "" })).toBeNull();
    expect(parseDayNote({ day: day(3), note: 5 })).toBeNull();
    expect(parseDayNote({ day: day(3), note: "x".repeat(2001) })).toBeNull();
  });
});

describe("sharp finger pain", () => {
  it("holds hard finger work off for seven days from the latest day the fingers hurt", () => {
    const notes = [note(3, { fingers: "hurts" }), note(5, { fingers: "hurts" })];
    expect(fingerHoldOff(notes, day(5))).toEqual({ holdOff: true, until: day(12) });
    expect(fingerHoldOff(notes, day(11))).toEqual({ holdOff: true, until: day(12) });
    expect(fingerHoldOff(notes, day(12))).toEqual({ holdOff: false, until: null });
  });

  it("is not triggered by soreness, by another area, or by a day that hasn't happened", () => {
    expect(fingerHoldOff([note(3, { fingers: "sore" }), note(4, { elbows: "hurts" })], day(5)).holdOff).toBe(false);
    expect(fingerHoldOff([note(9, { fingers: "hurts" })], day(5)).holdOff).toBe(false);
    expect(fingerHoldOff([], day(5)).holdOff).toBe(false);
  });
});

describe("repeated pain", () => {
  it("names an area that hurt on three different days in two weeks", () => {
    const notes = [note(1, { elbows: "hurts" }), note(6, { elbows: "hurts" }), note(12, { elbows: "hurts", fingers: "hurts" })];
    expect(repeatedPain(notes, day(14))).toEqual(["elbows"]);
  });

  it("does not count soreness, two days, the same day twice, or days older than two weeks", () => {
    expect(repeatedPain([note(1, { elbows: "sore" }), note(6, { elbows: "sore" }), note(12, { elbows: "sore" })], day(14))).toEqual([]);
    expect(repeatedPain([note(6, { elbows: "hurts" }), note(12, { elbows: "hurts" })], day(14))).toEqual([]);
    expect(repeatedPain([note(12, { elbows: "hurts" }), note(12, { elbows: "hurts" }), note(13, { elbows: "hurts" })], day(14))).toEqual([]);
    // 1 Nov is 13 days before 14 Nov (inside); the window is the last 14 days including today.
    expect(repeatedPain([note(1, { fingers: "hurts" }), note(2, { fingers: "hurts" }), note(3, { fingers: "hurts" })], day(14))).toEqual(["fingers"]);
    expect(repeatedPain([note(1, { fingers: "hurts" }), note(2, { fingers: "hurts" }), note(3, { fingers: "hurts" })], day(15))).toEqual([]);
  });

  it("words the note plainly, naming every area, with no cause", () => {
    expect(painNote([])).toBeNull();
    expect(painNote(["elbows"])).toBe("Your elbows have hurt on several days lately. Rest, and consider seeing a physio or doctor if it keeps coming back.");
    expect(painNote(["fingers", "elbows"])).toContain("Your fingers and your elbows have hurt");
    expect(painNote(["other"])).toContain("Something else has hurt");
  });
});

describe("a day's effort on its entries", () => {
  const entry = (id: string, d: string, effort: number | null): Activity => ({
    id, kind: "roped", at: `${d} 10:00:00`, day: d, title: id, ref: null,
    facts: { discipline: "roped", send: true, tries: 1, grade: 13, effort, fingerIntense: false },
  });

  it("puts the rating on every entry of that day and keeps a higher one the entry already had", () => {
    const list = [entry("a", day(3), null), entry("b", day(3), 9), entry("c", day(4), null)];
    const out = withDayEfforts(list, [note(3, { effort: 7 })]);
    expect(out.map((a) => a.facts.effort)).toEqual([7, 9, null]);
    expect(list[0].facts.effort).toBeNull();
  });

  it("returns the same list when there is nothing to apply", () => {
    const list = [entry("a", day(3), null)];
    expect(withDayEfforts(list, [])).toBe(list);
    expect(withDayEfforts(list, [note(3, { fingers: "sore" })])).toBe(list);
  });
});

describe("a check-in in one line", () => {
  it("names only what was said, in order", () => {
    expect(noteSummary(note(3, { fingers: "sore", elbows: "hurts", energy: 3, effort: 7 }))).toBe("Fingers sore \u00B7 Elbows hurt \u00B7 energy 3 of 5 \u00B7 effort 7 of 10");
    expect(noteSummary(note(3, { effort: 4 }))).toBe("effort 4 of 10");
    expect(noteSummary(note(3, { note: "only a note" }))).toBe("");
    expect(noteSummary(blankNote(day(3)))).toBe("");
  });
});

describe("reporting pain during a session", () => {
  const day = "2026-11-12";
  it("marks an ache as sore and a sharp pain as hurts, starting a note when there is none", () => {
    expect(reportPain(undefined, day, "fingers", "achy")).toMatchObject({ day, fingers: "sore", elbows: "fine" });
    expect(reportPain(undefined, day, "elbows", "sharp")).toMatchObject({ elbows: "hurts", fingers: "fine" });
  });

  it("never softens a worse state, and keeps the rest of the note", () => {
    const note = { ...blankNote(day), fingers: "hurts" as const, energy: 3, note: "tweaky" };
    expect(reportPain(note, day, "fingers", "achy")).toEqual(note);
    expect(reportPain({ ...note, fingers: "sore" }, day, "fingers", "sharp")).toMatchObject({ fingers: "hurts", energy: 3, note: "tweaky" });
  });
});

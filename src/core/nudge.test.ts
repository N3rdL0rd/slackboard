import { describe, expect, it } from "vitest";
import { boardActivity, type Activity } from "./activity";
import { blankNote, type DayNote } from "./body";
import { restNudge, withPlan, type NudgeInput } from "./nudge";
import type { LogEntry } from "./types";

// Monday 2 Nov 2026. "Today" is Wednesday the 4th unless a test says otherwise.
let n = 0;
const entry = (day: string, grade: number, over: Partial<LogEntry> = {}): Activity =>
  boardActivity({
    id: `e${++n}`, provider: "tension", climbUuid: `C${n}`, climbName: "Climb", angle: 40, isMirror: false, bidCount: 1, quality: 3, difficulty: grade, comment: "", climbedAt: `${day} 10:00:00`, isSend: true, ...over,
  }, (e) => e.difficulty);
const easy = (day: string) => entry(day, 1);
const hard = (day: string) => entry(day, 9);
const note = (day: string, over: Partial<DayNote> = {}): DayNote => ({ ...blankNote(day), ...over });
const base = (over: Partial<NudgeInput> = {}): NudgeInput => ({ activities: [], notes: [], today: "2026-11-04", level: "standard", working: { boulder: 5 }, streakAlive: false, snoozedThrough: null, ...over });

describe("switches and snoozes", () => {
  const threeDays = [easy("2026-11-02"), easy("2026-11-03"), easy("2026-11-04")];

  it("says nothing when the user has turned nudges off", () => {
    expect(restNudge(base({ activities: threeDays, level: "off" }))).toBeNull();
  });

  it("stays hidden through the day it was snoozed and comes back the next", () => {
    expect(restNudge(base({ activities: threeDays, snoozedThrough: "2026-11-04" }))).toBeNull();
    expect(restNudge(base({ activities: threeDays, snoozedThrough: "2026-11-05" }))).toBeNull();
    expect(restNudge(base({ activities: threeDays, snoozedThrough: "2026-11-03" }))?.id).toBe("three");
  });

  it("says nothing with nothing logged", () => {
    expect(restNudge(base())).toBeNull();
  });
});

describe("three in a row", () => {
  const threeDays = [easy("2026-11-02"), easy("2026-11-03"), easy("2026-11-04")];

  it("asks for a rest day at every sensitivity, hard or not", () => {
    for (const level of ["relaxed", "standard", "keen"] as const) {
      expect(restNudge(base({ activities: threeDays, level }))).toMatchObject({ id: "three", text: "3 days in a row. Take a rest day." });
    }
  });

  it("says a rest day keeps the streak going when one is alive, so the advice never fights it", () => {
    expect(restNudge(base({ activities: threeDays, streakAlive: true }))?.text).toBe("3 days in a row. Take a rest day. A rest day keeps your streak going.");
  });

  it("counts the run that ended yesterday, but not one that ended two days ago, and a gap breaks it", () => {
    const upToYesterday = [easy("2026-11-01"), easy("2026-11-02"), easy("2026-11-03")];
    expect(restNudge(base({ activities: upToYesterday }))?.id).toBe("three");
    expect(restNudge(base({ activities: upToYesterday, today: "2026-11-05" }))).toBeNull();
    expect(restNudge(base({ activities: [easy("2026-11-02"), easy("2026-11-04")] }))).toBeNull();
  });

  it("gives the reasons", () => {
    expect(restNudge(base({ activities: threeDays }))?.why[0]).toBe("You climbed on 3 days in a row.");
  });
});

describe("two in a row", () => {
  const easyTwo = [easy("2026-11-03"), easy("2026-11-04")];
  const hardTwo = [easy("2026-11-03"), hard("2026-11-04")];

  it("on Standard speaks up only when one of the two days was hard", () => {
    expect(restNudge(base({ activities: easyTwo }))).toBeNull();
    expect(restNudge(base({ activities: hardTwo }))).toMatchObject({ id: "back2back", text: "2 days in a row. A lighter day or rest day helps you recover." });
    expect(restNudge(base({ activities: hardTwo }))?.why).toContain("A recent day was hard: a send at your working grade, a high effort rating, finger work or a very long day.");
  });

  it("on Keen always speaks up, and says why", () => {
    const k = restNudge(base({ activities: easyTwo, level: "keen" }));
    expect(k?.id).toBe("back2back");
    expect(k?.why.join(" ")).toContain("Keen");
  });

  it("on Relaxed never speaks up for two days, however hard", () => {
    expect(restNudge(base({ activities: hardTwo, level: "relaxed" }))).toBeNull();
  });

  it("counts a day as hard when it was rated 7 or more", () => {
    const rated = [easy("2026-11-03"), { ...easy("2026-11-04"), facts: { ...easy("2026-11-04").facts, effort: 8 } }];
    expect(restNudge(base({ activities: rated }))?.id).toBe("back2back");
  });
});

describe("the fingers", () => {
  const three = [easy("2026-11-02"), easy("2026-11-03"), easy("2026-11-04")];

  it("speaks about sore fingers today, and more firmly about sharp pain", () => {
    expect(restNudge(base({ notes: [note("2026-11-04", { fingers: "sore" })] }))).toMatchObject({ id: "fingers", text: "Rest your fingers. Give them 48 hours before hard finger work." });
    const hurts = restNudge(base({ notes: [note("2026-11-04", { fingers: "hurts" })] }));
    expect(hurts?.text).toBe("Your fingers hurt. Rest them, and hold off hard finger work for a week.");
    expect(hurts?.why.join(" ")).toContain("not a diagnosis");
  });

  it("goes before the days-in-a-row lines, and only for today's check-in", () => {
    expect(restNudge(base({ activities: three, notes: [note("2026-11-04", { fingers: "sore" })] }))?.id).toBe("fingers");
    expect(restNudge(base({ activities: three, notes: [note("2026-11-03", { fingers: "sore" })] }))?.id).toBe("three");
    expect(restNudge(base({ notes: [note("2026-11-04", { elbows: "hurts" })] }))).toBeNull();
  });

  it("is still hidden by a snooze or by turning nudges off", () => {
    const notes = [note("2026-11-04", { fingers: "hurts" })];
    expect(restNudge(base({ notes, snoozedThrough: "2026-11-04" }))).toBeNull();
    expect(restNudge(base({ notes, level: "off" }))).toBeNull();
  });
});

describe("a big week", () => {
  // One long day: twelve easy sends on Wednesday, nothing in the weeks before, so the baseline is the floor.
  const bigDay = Array.from({ length: 12 }, () => easy("2026-11-04"));

  it("suggests a light day when this week is far above the usual, and says so in the streak's terms", () => {
    expect(restNudge(base({ activities: bigDay }))).toMatchObject({ id: "bigweek", text: "A big week. Keep a light day in." });
    expect(restNudge(base({ activities: bigDay, streakAlive: true }))?.text).toBe("A big week. Keep a light day in. A rest day keeps your streak going.");
  });

  it("stays quiet for a normal week, and for one that matches the user's own usual", () => {
    expect(restNudge(base({ activities: [easy("2026-11-04"), easy("2026-11-04")] }))).toBeNull();
    const usual = ["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"].flatMap((d) => Array.from({ length: 12 }, () => easy(d)));
    expect(restNudge(base({ activities: [...usual, ...bigDay] }))).toBeNull();
  });

  it("comes after the days-in-a-row lines", () => {
    const threeBig = [...Array.from({ length: 12 }, () => easy("2026-11-02")), easy("2026-11-03"), ...bigDay];
    expect(restNudge(base({ activities: threeBig }))?.id).toBe("three");
  });
});

describe("the nudge on a planned light day", () => {
  const n = { id: "back2back" as const, text: "Two hard days in a row. A lighter day helps.", why: ["Hard days: Tue and Wed."] };

  it("says the plan already has a light day, and keeps the reasons", () => {
    const r = withPlan(n, true)!;
    expect(r.text).toBe("Your plan has a light day today, which fits.");
    expect(r.id).toBe("back2back");
    expect(r.why).toContain("Hard days: Tue and Wed.");
  });

  it("changes nothing on other days, or when there is no nudge", () => {
    expect(withPlan(n, false)).toBe(n);
    expect(withPlan(null, true)).toBeNull();
  });
});

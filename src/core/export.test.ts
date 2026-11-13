import { BACKUP_VERSION } from "./backup";
import { EMPTY_MOON } from "./moonBackup";
import { EMPTY_PREFS } from "./prefsBackup";
import { EMPTY_SPACES } from "./spacesBackup";
import { describe, expect, it } from "vitest";
import { parseStamp as at } from "./days";
import { csvField, CSV_HEADER, exportFileName, exportJson, inRange, logbookCsv } from "./export";
import type { LogEntry } from "./types";
import type { RopedLog } from "./roped";

const e = (over: Partial<LogEntry> = {}): LogEntry => ({ id: "1", provider: "tension", climbUuid: "U1", climbName: "Masquerade", angle: 40, isMirror: false, bidCount: 2, quality: 3, difficulty: 16, comment: "", climbedAt: "2026-10-28 18:00:00", isSend: true, ...over });
const g = (x: { difficulty: number }) => ({ v: `V${x.difficulty - 13}`, font: "6a" });

describe("csvField", () => {
  it("quotes commas, quotes and line breaks", () => {
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("two\nlines")).toBe('"two\nlines"');
    expect(csvField("plain")).toBe("plain");
  });
  it("defuses spreadsheet formulas in text but leaves numbers alone", () => {
    expect(csvField("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvField("@cmd")).toBe("'@cmd");
    expect(csvField(-3)).toBe("-3");
  });
  it("writes null as empty", () => expect(csvField(null)).toBe(""));
});

describe("logbookCsv", () => {
  it("has the header, one row per entry, and CRLF line ends", () => {
    const out = logbookCsv([e(), e({ isSend: false, difficulty: 0, climbName: 'Oh, "no"' })], g);
    const lines = out.split("\r\n");
    expect(lines[0]).toBe(CSV_HEADER.join(","));
    expect(lines[1]).toBe("2026-10-28 18:00:00,tension,Masquerade,U1,send,40,false,2,V3,6a,3,,,,,,,board,,,,,,,");
    expect(lines[2]).toBe('2026-10-28 18:00:00,tension,"Oh, ""no""",U1,attempts,40,false,2,,,,,,,,,,board,,,,,,,');
    expect(out.endsWith("\r\n")).toBe(true);
  });
  it("is just the header for an empty logbook", () => expect(logbookCsv([], g)).toBe(CSV_HEADER.join(",") + "\r\n"));

  it("adds roped climbs with their own grade columns, kept apart from the V grade columns", () => {
    const roped: RopedLog[] = [
      { id: "r1", style: "sport", setting: "outdoor", name: "Slab, Happy", venue: "Index", link: "https://thecrag.com/r", gradeSystem: "yds", gradeLabel: "5.10c", grade: 13, result: "redpoint", attempts: 3, lengthM: 24.5, pitches: 2, note: "=hard", climbedAt: "2026-10-29 09:00:00" },
      { id: "r2", style: "autobelay", setting: "indoor", name: "", venue: "", link: "", gradeSystem: "french", gradeLabel: "6a", grade: 12, result: "redpoint", attempts: 6, lengthM: null, pitches: 1, note: "", climbedAt: "2026-10-27 09:00:00" },
      { id: "r3", style: "trad", setting: "outdoor", name: "", venue: "", link: "", gradeSystem: "yds", gradeLabel: "5.11a", grade: 15, result: "fell", attempts: 1, lengthM: null, pitches: 1, note: "", climbedAt: "2026-10-26 09:00:00" },
    ];
    const lines = logbookCsv([e()], g, [], undefined, roped).split("\r\n");
    expect(lines).toHaveLength(6);
    // Newest first, with the board entry among them; the kind column says which is which.
    expect(lines[1]).toBe("2026-10-29 09:00:00,,\"Slab, Happy\",r1,send,,,3,,,,'=hard,outdoor,Index,,,https://thecrag.com/r,roped,sport,redpoint,5.10c,6a+,24.5,2,");
    expect(lines[2]).toMatch(/,U1,send,40,.*,board,,,,,,,$/);
    expect(lines[3]).toBe("2026-10-27 09:00:00,,6a autobelay,r2,send,,,6,,,,,indoor,,,,,roped,autobelay,redpoint,5.10b,6a,,1,");
    expect(lines[4]).toBe("2026-10-26 09:00:00,,5.11a trad,r3,attempts,,,1,,,,,outdoor,,,,,roped,trad,fell,5.11a,6b+,,1,");
  });
});

describe("exportJson", () => {
  const base = { now: new Date("2026-10-31T12:00:00Z"), user: { id: 7, username: "n" }, range: "all" as const, circuits: [], offBoard: [], roped: [], training: [], goals: [], dayNotes: [], litHistory: [], moon: EMPTY_MOON, spaces: EMPTY_SPACES, preferences: EMPTY_PREFS, liked: ["b", "a"], blocked: [], boards: [], gradeOf: g };
  it("round-trips the logbook with grades, drops the pending flag, and sorts tag lists", () => {
    const parsed = JSON.parse(exportJson({ ...base, logbook: [{ ...e(), pending: true }] }));
    expect(parsed.logbook[0]).toMatchObject({ climbName: "Masquerade", grade_v: "V3" });
    expect(parsed.logbook[0]).not.toHaveProperty("pending");
    expect(parsed.liked).toEqual(["a", "b"]);
    expect(parsed.version).toBe(BACKUP_VERSION);
    expect(parsed.offBoard).toEqual([]);
  });
});

describe("inRange and file names", () => {
  const now = new Date(2026, 9, 31, 12);
  const rows = [e({ climbedAt: "2026-10-20 10:00:00" }), e({ climbedAt: "2026-03-01 10:00:00" }), e({ climbedAt: "2024-01-01 10:00:00" })];
  it("filters by age", () => {
    expect(inRange(rows, "all", now, at)).toHaveLength(3);
    expect(inRange(rows, "year", now, at)).toHaveLength(2);
    expect(inRange(rows, "month", now, at)).toHaveLength(1);
  });
  it("makes a safe dated file name", () => {
    expect(exportFileName("csv", now, "Jo B/../x")).toBe("slackboard-JoBx-2026-10-31.csv");
    expect(exportFileName("json", now, "")).toBe("slackboard-me-2026-10-31.json");
  });
});

import { describe, expect, it } from "vitest";
import { addEntry, crashEntry, logText, MAX_ENTRIES, parseLog } from "./crashLog";

const NOW = new Date("2026-11-13T10:00:00Z");

describe("crash log", () => {
  it("records an error with its time, version and a trimmed message and stack", () => {
    const err = Object.assign(new Error("x".repeat(2000)), { stack: "s".repeat(9000) });
    const e = crashEntry(err, true, NOW, "0.1.0");
    expect(e).toMatchObject({ at: "2026-11-13T10:00:00.000Z", fatal: true, name: "Error", version: "0.1.0" });
    expect(e.message).toHaveLength(500);
    expect(e.stack).toHaveLength(3000);
  });
  it("keeps something that is not an Error as text", () => {
    expect(crashEntry("boom", false, NOW, "1").message).toBe("boom");
    expect(crashEntry(undefined, false, NOW, "1").message).toBe("undefined");
  });
  it("keeps the newest entries, capped", () => {
    let log = [] as ReturnType<typeof parseLog>;
    for (let i = 0; i < MAX_ENTRIES + 5; i++) log = addEntry(log, crashEntry(new Error(`e${i}`), false, NOW, "1"));
    expect(log).toHaveLength(MAX_ENTRIES);
    expect(log[0].message).toBe(`e${MAX_ENTRIES + 4}`);
  });
  it("reads a stored file safely", () => {
    expect(parseLog("not json")).toEqual([]);
    expect(parseLog('{"a":1}')).toEqual([]);
    const good = crashEntry(new Error("a"), false, NOW, "1");
    expect(parseLog(JSON.stringify([good, { at: 5 }, null, "x"]))).toEqual([good]);
  });
  it("says plainly when there is nothing", () => {
    expect(logText([])).toBe("No errors recorded.\n");
    expect(logText([crashEntry(new Error("a"), true, NOW, "2")])).toContain("FATAL");
  });
});

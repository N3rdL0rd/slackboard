import { describe, expect, it } from "vitest";
import { autoBackupName, backupDue, clampKeep, isAutoBackupName, staleBackups } from "./autoBackup";

describe("automatic backup files", () => {
  it("names a file by day, and recognises only its own names", () => {
    expect(autoBackupName("2026-11-13")).toBe("slackboard-auto-2026-11-13.json");
    expect(isAutoBackupName("slackboard-auto-2026-11-13.json")).toBe(true);
    for (const n of ["slackboard-me-2026-11-13.json", "slackboard-auto-2026-11-13.json.bak", "notes.txt", "slackboard-auto-x.json"]) expect(isAutoBackupName(n)).toBe(false);
  });
  it("is due on the first run of each day and when nothing was made", () => {
    expect(backupDue("", "2026-11-13")).toBe(true);
    expect(backupDue("2026-11-12", "2026-11-13")).toBe(true);
    expect(backupDue("2026-11-13", "2026-11-13")).toBe(false);
    // A clock set back does not make a backup due again.
    expect(backupDue("2026-11-14", "2026-11-13")).toBe(false);
  });
  it("deletes the oldest beyond the number to keep, and nothing else in the folder", () => {
    const names = ["slackboard-auto-2026-11-10.json", "my-photo.jpg", "slackboard-auto-2026-11-12.json", "slackboard-auto-2026-11-11.json", "slackboard-me-2026-01-01.json"];
    expect(staleBackups(names, 2)).toEqual(["slackboard-auto-2026-11-10.json"]);
    expect(staleBackups(names, 3)).toEqual([]);
    expect(staleBackups(names, 0)).toEqual(["slackboard-auto-2026-11-10.json", "slackboard-auto-2026-11-11.json"]);
  });
  it("clamps the number to keep", () => {
    expect(clampKeep(0)).toBe(1);
    expect(clampKeep(500)).toBe(60);
    expect(clampKeep("x")).toBe(7);
    expect(clampKeep(14.4)).toBe(14);
  });
});

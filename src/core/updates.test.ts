import { describe, expect, it } from "vitest";
import { checkDue, installedBuild, parseLatestBuild, updateAvailable } from "./updates";

const run = (over: object = {}) => ({ workflow_runs: [{ run_number: 42, updated_at: "2026-11-13T10:00:00Z", conclusion: "success", ...over }] });

describe("update check", () => {
  it("reads the newest successful build", () => {
    expect(parseLatestBuild(run())).toEqual({ build: 42, at: "2026-11-13" });
  });
  it("refuses an answer that is not what was expected", () => {
    for (const bad of [null, "x", {}, { workflow_runs: [] }, run({ run_number: "42" }), run({ run_number: 0 }), run({ run_number: 4.5 }), run({ conclusion: "failure" })]) expect(parseLatestBuild(bad)).toBeNull();
  });
  it("is available only when the installed build is older", () => {
    const latest = { build: 42, at: "" };
    expect(updateAvailable(41, latest)).toBe(true);
    expect(updateAvailable(42, latest)).toBe(false);
    expect(updateAvailable(43, latest)).toBe(false);
    expect(updateAvailable(null, latest)).toBe(false);
    expect(updateAvailable(41, null)).toBe(false);
  });
  it("reads the installed build only when it is a whole number", () => {
    expect(installedBuild("17")).toBe(17);
    for (const v of ["", "0", "1.5", "abc", null, undefined]) expect(installedBuild(v)).toBeNull();
  });
  it("checks at most once a day", () => {
    expect(checkDue("", "2026-11-13")).toBe(true);
    expect(checkDue("2026-11-12", "2026-11-13")).toBe(true);
    expect(checkDue("2026-11-13", "2026-11-13")).toBe(false);
  });
});

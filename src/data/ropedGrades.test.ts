import { describe, expect, it } from "vitest";
import { GRADE_ROWS } from "../core/gradeTable";
import { findRopedGrade, otherSystem, ROPED_GRADES, ropedBand, ropedGradeAt, ropedLabel, ropedValue } from "./ropedGrades";

describe("roped grades", () => {
  it("is one list of consecutive IRCRA steps with no repeated label in either system", () => {
    ROPED_GRADES.forEach((g, i) => { if (i > 0) expect(g.value).toBe(ROPED_GRADES[i - 1].value + 1); });
    expect(new Set(ROPED_GRADES.map((g) => g.yds)).size).toBe(ROPED_GRADES.length);
    expect(new Set(ROPED_GRADES.map((g) => g.french)).size).toBe(ROPED_GRADES.length);
  });

  it("agrees with every route pair the app already holds for boards", () => {
    // The board table's `difficulty` is the IRCRA number, so each of its "6a/5.10b" pairs must be the same step here.
    const disagreements: string[] = [];
    for (const row of GRADE_ROWS) {
      const [french, yds] = row.route_name.split("/");
      if (!french || !yds) continue;
      const mine = ropedGradeAt(row.difficulty);
      if (!mine) { disagreements.push(`${row.difficulty}: ${row.route_name} is not in the roped list`); continue; }
      if (mine.french !== french || mine.yds !== yds) disagreements.push(`${row.difficulty}: board table ${row.route_name}, roped list ${mine.french}/${mine.yds}`);
    }
    expect(disagreements).toEqual([]);
  });

  it("reads and writes labels in both systems", () => {
    expect(ropedValue("yds", "5.10c")).toBe(13);
    expect(ropedValue("french", "6a+")).toBe(13);
    expect(ropedLabel(13, "french")).toBe("6a+");
    expect(ropedLabel(13, "yds")).toBe("5.10c");
    expect(ropedValue("yds", "5.10e")).toBeNull();
    expect(ropedValue("french", "5.10c")).toBeNull();
    expect(findRopedGrade("yds", "5.12a")?.french).toBe("7a+");
    expect(ropedLabel(2, "yds")).toBeNull();
    expect(otherSystem("yds")).toBe("french");
  });

  it("draws the grades below the boards' range in their own bands, and from 5.9 in the boards' bands", () => {
    expect(ropedBand(5).name).toBe("cyan");
    expect(ropedBand(7).name).toBe("cyan");
    expect(ropedBand(8).name).toBe("yellow");
    expect(ropedBand(9).name).toBe("yellow");
    expect(ropedBand(10).name).toBe("pink");
    expect(ropedBand(12).name).toBe("pink");
    expect(ropedBand(13).name).toBe("blue");
    expect(ropedBand(34).name).toBe(ropedBand(33).name);
    // Every roped grade has a band, and each easy band differs from the one above it.
    for (const g of ROPED_GRADES) expect(ropedBand(g.value).fill).toMatch(/^#[0-9A-F]{6}$/);
    expect(ropedBand(7).fill).not.toBe(ropedBand(8).fill);
    expect(ropedBand(9).fill).not.toBe(ropedBand(10).fill);
    // The easiest band is a ring on a dark chip, like the hardest ones, so it is told apart by form too.
    expect(ropedBand(7).borderWidth).toBeGreaterThan(0);
    expect(ropedBand(8).borderWidth).toBe(0);
  });
});

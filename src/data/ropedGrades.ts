/**
 * Roped grades: YDS and French, one list, in steps of the IRCRA scale (Draper et al. 2015, the scale climbing researchers use to put
 * grades from different systems on one number line). The number is what is stored and compared; the labels are what the user sees.
 *
 * Where this list overlaps the pairs the app already holds for boards (`route_name` in gradeTable.ts, the same pairs the boards' own
 * app shows) the two agree, and a test checks it. Below IRCRA 5 (YDS 5.4, French 3) nothing is offered: it would be a guess.
 */
import { EASIEST_BAND, EASY_BAND, type GradeBand } from "../core/grades";
import { grades } from "./grades";

export type RopedSystem = "yds" | "french";

export interface RopedGrade {
  /** The IRCRA number: higher is harder, one step at a time. */
  value: number;
  yds: string;
  french: string;
}

const LIST: [number, string, string][] = [
  [5, "5.4", "3"], [6, "5.5", "3+"], [7, "5.6", "4b"], [8, "5.7", "4c"], [9, "5.8", "5a"], [10, "5.9", "5b"],
  [11, "5.10a", "5c"], [12, "5.10b", "6a"], [13, "5.10c", "6a+"], [14, "5.10d", "6b"], [15, "5.11a", "6b+"], [16, "5.11b", "6c"],
  [17, "5.11c", "6c+"], [18, "5.11d", "7a"], [19, "5.12a", "7a+"], [20, "5.12b", "7b"], [21, "5.12c", "7b+"], [22, "5.12d", "7c"],
  [23, "5.13a", "7c+"], [24, "5.13b", "8a"], [25, "5.13c", "8a+"], [26, "5.13d", "8b"], [27, "5.14a", "8b+"], [28, "5.14b", "8c"],
  [29, "5.14c", "8c+"], [30, "5.14d", "9a"], [31, "5.15a", "9a+"], [32, "5.15b", "9b"], [33, "5.15c", "9b+"], [34, "5.15d", "9c"],
];

/** Easiest first. */
export const ROPED_GRADES: readonly RopedGrade[] = LIST.map(([value, yds, french]) => ({ value, yds, french }));

export const ROPED_SYSTEM_LABEL: Record<RopedSystem, string> = { yds: "YDS", french: "French" };

const byValue = new Map(ROPED_GRADES.map((g) => [g.value, g]));

export const ropedGradeAt = (value: number): RopedGrade | undefined => byValue.get(value);

/** The grade a label names in a system, or undefined for one the list doesn't have. */
export const findRopedGrade = (system: RopedSystem, label: string): RopedGrade | undefined => ROPED_GRADES.find((g) => g[system] === label);

/** The IRCRA number of a label, or null for one the list doesn't have. */
export const ropedValue = (system: RopedSystem, label: string): number | null => findRopedGrade(system, label)?.value ?? null;

/** A grade's label in a system. */
export const ropedLabel = (value: number, system: RopedSystem): string | null => byValue.get(value)?.[system] ?? null;

/** The same grade in the other system, for showing both ("5.10c, 6a+"). */
export const otherSystem = (system: RopedSystem): RopedSystem => (system === "yds" ? "french" : "yds");

/**
 * The colour band a roped grade is drawn in, so the strip looks like the boulder one. The IRCRA number is also the board table's
 * difficulty number, so from 5.9 (IRCRA 10) a roped grade takes the band of the board grade on the same step. Easier grades have
 * their own bands: yellow for 5.7 and 5.8, and a cyan ring on a dark chip for 5.6 and below. This is only a colour: it implies no
 * conversion between roped and boulder grades, and nothing is computed from it.
 */
export const ropedBand = (value: number): GradeBand => (value < 8 ? EASIEST_BAND : value < 10 ? EASY_BAND : grades.band(Math.min(33, value)));

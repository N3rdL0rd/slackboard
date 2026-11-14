/**
 * What goes on the weekly and yearly review images: the wording and numbers, kept free of UI so they can be tested.
 * Both are built from the review the screen is already showing, so the image always agrees with it. An empty period has no image.
 */
import type { Day } from "./days";
import { shortDate } from "./goals";
import type { ReviewLabels, WeeklyReview, YearlyReview } from "./review";
import { streakLabel, type DayMark } from "./streak";

export interface CardFigure { value: number; label: string }
export interface CardGrade { scale: "boulder" | "roped"; grade: number; label: string }

export interface WeekCardFacts {
  kind: "week";
  title: string;
  range: string;
  figures: CardFigure[];
  /** The week's hardest boulder and roped send, when there are any. */
  hardest: CardGrade[];
  /** Monday to Sunday. */
  dots: { letter: string; mark: DayMark }[];
  streak: string | null;
  highlight: string | null;
  /** Names the saved file. */
  fileKey: string;
}

export interface YearCardFacts {
  kind: "year";
  title: string;
  figures: CardFigure[];
  hardest: CardGrade[];
  /** The most-sent boulder and roped grades, hardest first, with their send counts. */
  pyramid: (CardGrade & { count: number })[];
  /** Per month, the days of the month that had climbing. */
  months: { label: string; days: number[]; length: number }[];
  longestStreak: string | null;
  bestWeek: string | null;
  fileKey: string;
}

export type ReviewCardFacts = WeekCardFacts | YearCardFacts;

const LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const noun = (n: number, one: string, many: string) => (n === 1 ? one : many);
const PYRAMID_BOULDER_ROWS = 6;
const PYRAMID_ROPED_ROWS = 3;

/** The week's image content, or null for a week with nothing logged. `marks` are the seven days' marks, Monday first. */
export function weekCardFacts(r: WeeklyReview, marks: DayMark[], labels: ReviewLabels): WeekCardFacts | null {
  if (r.empty) return null;
  const hardest: CardGrade[] = [];
  if (r.hardestBoulder !== null) hardest.push({ scale: "boulder", grade: r.hardestBoulder, label: labels.boulder(r.hardestBoulder) });
  if (r.hardestRoped !== null) hardest.push({ scale: "roped", grade: r.hardestRoped, label: labels.roped(r.hardestRoped) });
  return {
    kind: "week",
    title: `Week of ${shortDate(r.weekStart)}`,
    range: `${shortDate(r.weekStart)} to ${shortDate(r.weekEnd)}`,
    figures: [
      { value: r.days, label: noun(r.days, "day", "days") },
      { value: r.sends, label: noun(r.sends, "send", "sends") },
      { value: r.attempts, label: noun(r.attempts, "try", "tries") },
    ],
    hardest,
    dots: LETTERS.map((letter, i) => ({ letter, mark: marks[i] ?? "empty" })),
    streak: r.streak.current > 0 ? streakLabel(r.streak) : null,
    highlight: r.highlight,
    fileKey: r.weekStart,
  };
}

/** The year's image content, or null for a year with nothing logged. */
export function yearCardFacts(y: YearlyReview, labels: ReviewLabels): YearCardFacts | null {
  if (y.empty) return null;
  const hardest: CardGrade[] = [];
  if (y.hardestBoulder) hardest.push({ scale: "boulder", grade: y.hardestBoulder.grade, label: labels.boulder(y.hardestBoulder.grade) });
  if (y.hardestRoped) hardest.push({ scale: "roped", grade: y.hardestRoped.grade, label: labels.roped(y.hardestRoped.grade) });
  const pyramid = [
    ...y.pyramid.boulder.slice(0, PYRAMID_BOULDER_ROWS).map((p) => ({ scale: "boulder" as const, grade: p.grade, label: labels.boulder(p.grade), count: p.count })),
    ...y.pyramid.roped.slice(0, PYRAMID_ROPED_ROWS).map((p) => ({ scale: "roped" as const, grade: p.grade, label: labels.roped(p.grade), count: p.count })),
  ];
  return {
    kind: "year",
    title: `${y.year} in review`,
    figures: [
      { value: y.days, label: noun(y.days, "day", "days") },
      { value: y.sends, label: noun(y.sends, "send", "sends") },
      { value: y.attempts, label: noun(y.attempts, "try", "tries") },
    ],
    hardest,
    pyramid,
    months: y.months.map((m) => ({ label: MONTHS[m.month - 1], days: m.days, length: new Date(y.year, m.month, 0).getDate() })),
    longestStreak: y.longestStreak > 0 ? `Longest streak: ${y.longestStreak} ${noun(y.longestStreak, "day", "days")}` : null,
    bestWeek: y.bestWeek ? `Best week: ${shortDate(y.bestWeek.weekStart)}, ${y.bestWeek.days} ${noun(y.bestWeek.days, "day", "days")}, ${y.bestWeek.sends} ${noun(y.bestWeek.sends, "send", "sends")}` : null,
    fileKey: String(y.year),
  };
}


/**
 * The rest nudge: one dismissible line on the Climb tab when the log says the user has been going hard, with the reasons one tap away.
 * It reads the same load model as the reviews and the planner, so they agree. It is advice, never a rule, and never a message about
 * being behind. "Not today" hides it through the end of the day; the sensitivity setting (and "off") is the user's.
 */
import type { Activity } from "./activity";
import { isHardDay, isSpike, loadByDay, typicalDayEntries, type WorkingGrades } from "./load";
import type { DayNote } from "./body";
import { daysBetween, addDays, weekStartDay, type Day } from "./days";
import type { NudgeLevel } from "./settings";

export type NudgeId = "fingers" | "three" | "back2back" | "bigweek";

export interface Nudge {
  id: NudgeId;
  /** The line itself. */
  text: string;
  /** The reasons, for "Why?". */
  why: string[];
}

export interface NudgeInput {
  activities: Activity[];
  /** The body check-ins. Today's can make the line about the fingers. */
  notes: DayNote[];
  today: Day;
  level: NudgeLevel;
  working: WorkingGrades;
  /** Whether a streak is alive, so the line can say a rest day keeps it going. */
  streakAlive: boolean;
  /** The last day the line is hidden through ("Not today" sets it to today). */
  snoozedThrough?: Day | null;
}

const STREAK_NOTE = " A rest day keeps your streak going.";

/** The consecutive calendar days ending at `end` that have entries. */
function runEndingAt(days: Set<Day>, end: Day): Day[] {
  const run: Day[] = [];
  for (let d = end; days.has(d); d = addDays(d, -1)) run.unshift(d);
  return run;
}

/**
 * The nudge to show now, or null. In order: the fingers (from today's check-in), three days in a row, two in a row when they were hard
 * (or always, on Keen; never on Relaxed), and a big week. At most one is returned.
 */
/**
 * On a day the plan deliberately made light, the rest line says so instead of warning: the user is already doing what it would suggest.
 * Any other day, or no nudge, is unchanged.
 */
export function withPlan(nudge: Nudge | null, plannedLightToday: boolean): Nudge | null {
  if (!nudge || !plannedLightToday) return nudge;
  return { id: nudge.id, text: "Your plan has a light day today, which fits.", why: ["You have been going hard, and today's planned session is a light one on purpose.", ...nudge.why] };
}

export function restNudge(input: NudgeInput): Nudge | null {
  const { activities, notes, today, level, working, streakAlive, snoozedThrough } = input;
  if (level === "off") return null;
  if (snoozedThrough && snoozedThrough >= today) return null;
  const tail = streakAlive ? STREAK_NOTE : "";

  const todays = notes.find((n) => n.day === today);
  if (todays && todays.fingers !== "fine") {
    return todays.fingers === "hurts"
      ? { id: "fingers", text: "Your fingers hurt. Rest them, and hold off hard finger work for a week.", why: ["You noted that your fingers hurt today.", "Sharp finger pain is a reason to rest, not to push through. This is not a diagnosis."] }
      : { id: "fingers", text: "Rest your fingers. Give them 48 hours before hard finger work.", why: ["You noted sore fingers today."] };
  }

  const dayList = [...new Set(activities.filter((a) => a.day <= today).map((a) => a.day))];
  const days = new Set(dayList);
  const last = dayList.length ? dayList.reduce((a, b) => (b > a ? b : a)) : null;
  // The run counts when it ends today, or yesterday (so the morning after two hard days still gets the advice).
  if (last !== null && daysBetween(last, today) <= 1) {
    const run = runEndingAt(days, last);
    const typical = typicalDayEntries(activities);
    const entriesOf = (d: Day) => activities.filter((a) => a.day === d);
    const hardDays = run.slice(-2).filter((d) => isHardDay(entriesOf(d), working, typical));
    const hardReason = hardDays.length ? ["A recent day was hard: a send at your working grade, a high effort rating, finger work or a very long day."] : [];
    const listDays = `You climbed on ${run.length} days in a row.`;
    if (run.length >= 3) return { id: "three", text: `${run.length} days in a row. Take a rest day.${tail}`, why: [listDays, ...hardReason] };
    const twoRule = level === "keen" || (level === "standard" && hardDays.length > 0);
    if (run.length === 2 && twoRule) return { id: "back2back", text: `2 days in a row. A lighter day or rest day helps you recover.${tail}`, why: [listDays, ...(level === "keen" ? ["Your rest nudges are set to Keen, which speaks up after any two days in a row."] : hardReason)] };
  }

  const byDay = loadByDay(activities, working);
  const start = weekStartDay(today);
  if (isSpike(byDay, start)) return { id: "bigweek", text: `A big week. Keep a light day in.${tail}`, why: ["This week's load is well above your usual, which is the average of your last four weeks."] };
  return null;
}

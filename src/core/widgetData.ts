/**
 * What the home-screen widgets show. The app writes a small snapshot when its data changes; a widget turns the snapshot into a
 * view for the current day when it is drawn, so a widget that has not been refreshed since yesterday still shows today's date,
 * the right streak state and the right week. Pure: the widgets and the writing are elsewhere.
 */
import { addDays, type Day } from "./days";
import { streakInfo, streakLabel, streakStateText, weekDots, type StreakState, type WeekDot } from "./streak";
import { weekStartDay } from "./days";

/** How many days of history the snapshot keeps: enough for any streak the widget could be asked about. */
export const SNAPSHOT_DAYS = 120;
const SEND_DAYS = 14;
const PLAN_DAYS = 14;

export interface SnapshotSession { id: string; day: Day; title: string; minutes: number; status: "planned" | "done" | "skipped" }
export interface SnapshotGoal { title: string; progress: number; summary: string }
export interface WidgetSnapshot {
  v: 1;
  writtenAt: string;
  /** Local days with something that counts, newest first. */
  climbingDays: Day[];
  /** Sends per local day, for the last two weeks. */
  sends: Record<Day, number>;
  plan: SnapshotSession[];
  goal: SnapshotGoal | null;
}

export const EMPTY_SNAPSHOT: WidgetSnapshot = { v: 1, writtenAt: "", climbingDays: [], sends: {}, plan: [], goal: null };

export interface SnapshotInput {
  today: Day;
  now: Date;
  /** Every logged entry's day, and whether it was a send. */
  entries: { day: Day; send: boolean; counts: boolean }[];
  plan: SnapshotSession[];
  goal: SnapshotGoal | null;
}

export function buildSnapshot(i: SnapshotInput): WidgetSnapshot {
  const oldest = addDays(i.today, -SNAPSHOT_DAYS);
  const sendFrom = addDays(i.today, -SEND_DAYS);
  const days = new Set<Day>();
  const sends: Record<Day, number> = {};
  for (const e of i.entries) {
    if (e.day < oldest || e.day > i.today) continue;
    if (e.counts) days.add(e.day);
    if (e.send && e.day >= sendFrom) sends[e.day] = (sends[e.day] ?? 0) + 1;
  }
  return {
    v: 1,
    writtenAt: i.now.toISOString(),
    climbingDays: [...days].sort().reverse(),
    sends,
    plan: i.plan.filter((s) => s.day >= addDays(i.today, -1) && s.day <= addDays(i.today, PLAN_DAYS)).slice(0, 20),
    goal: i.goal && Number.isFinite(i.goal.progress) ? { title: i.goal.title.slice(0, 100), progress: Math.min(1, Math.max(0, i.goal.progress)), summary: i.goal.summary.slice(0, 120) } : null,
  };
}

const isDay = (x: unknown): x is Day => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x);

/** A stored snapshot is untrusted: anything that is not the expected shape is dropped, and a bad file is an empty one. */
export function parseSnapshot(text: string | null): WidgetSnapshot {
  if (!text) return EMPTY_SNAPSHOT;
  try {
    const r = JSON.parse(text) as Partial<WidgetSnapshot> | null;
    if (!r || r.v !== 1) return EMPTY_SNAPSHOT;
    const sends: Record<Day, number> = {};
    if (r.sends && typeof r.sends === "object") for (const [d, n] of Object.entries(r.sends)) if (isDay(d) && typeof n === "number" && n >= 0 && n < 1000) sends[d] = n;
    const plan = Array.isArray(r.plan)
      ? r.plan.filter((s) => s && typeof s.id === "string" && isDay(s.day) && typeof s.title === "string" && typeof s.minutes === "number" && (s.status === "planned" || s.status === "done" || s.status === "skipped"))
      : [];
    const g = r.goal;
    return {
      v: 1,
      writtenAt: typeof r.writtenAt === "string" ? r.writtenAt : "",
      climbingDays: Array.isArray(r.climbingDays) ? r.climbingDays.filter(isDay).slice(0, SNAPSHOT_DAYS + 1) : [],
      sends,
      plan,
      goal: g && typeof g.title === "string" && typeof g.progress === "number" && typeof g.summary === "string" ? g : null,
    };
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

export type TodayKind = "session" | "done" | "rest" | "none";
export interface WidgetView {
  streak: { current: number; state: StreakState; label: string; longest: number; text: string };
  week: { today: Day; dots: WeekDot[]; sends: number };
  today: { kind: TodayKind; title: string; minutes: number; sessionId: string | null };
  goal: SnapshotGoal | null;
}

/** The snapshot as it reads on `today`. */
export function widgetView(s: WidgetSnapshot, today: Day): WidgetView {
  const info = streakInfo(s.climbingDays, today);
  const dots = weekDots(s.climbingDays, today);
  const start = weekStartDay(today);
  let sends = 0;
  for (let i = 0; i < 7; i++) sends += s.sends[addDays(start, i)] ?? 0;
  const todays = s.plan.filter((p) => p.day === today);
  const planned = todays.find((p) => p.status === "planned");
  const done = todays.find((p) => p.status === "done");
  const hasPlan = s.plan.length > 0;
  const kind: TodayKind = planned ? "session" : done ? "done" : hasPlan ? "rest" : "none";
  const shown = planned ?? done;
  return {
    streak: { current: info.current, state: info.state, label: streakLabel(info), longest: info.longest, text: streakStateText(info) },
    week: { today, dots, sends },
    today: { kind, title: shown?.title ?? "", minutes: shown?.minutes ?? 0, sessionId: planned?.id ?? null },
    goal: s.goal,
  };
}

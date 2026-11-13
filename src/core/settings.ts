/**
 * The user's settings: what they are, their defaults, and how to read them back safely (from the phone's stored copy, which an older build
 * may have written without the newest fields, or from a backup file, which is untrusted). The one definition the store, the backup and the
 * notification scheduler all share.
 */
import type { GradeDisplay } from "./grades";
import { DEFAULT_EQUIVALENCE, parseEquivalence, type RopedEquivalence } from "./ropedEquivalence";

export type WeightUnit = "kg" | "lb";
export type LengthUnit = "m" | "ft";
export interface Units { weight: WeightUnit; length: LengthUnit }

/** How readily the app suggests a rest day. */
export type NudgeLevel = "off" | "relaxed" | "standard" | "keen";

/** Which local notifications are on, and when. Every type is off until the user turns it on. Times are 24-hour "HH:mm". */
export interface NotificationPrefs {
  /** A reminder on days with a planned session. */
  plan: boolean;
  planTime: string;
  /** The weekly review, on Monday. */
  review: boolean;
  reviewTime: string;
  /** On the last day that keeps a streak alive, if nothing is logged yet. */
  streak: boolean;
  /** After a hard day: tomorrow is a rest day in the plan. */
  rest: boolean;
  /** The single closest milestone, at most weekly. */
  milestone: boolean;
  /** One alert when a rest in a training session ends while the app is in the background. */
  sessionRest: boolean;
  quietStart: string;
  quietEnd: string;
}

export interface Settings {
  gradeDisplay: GradeDisplay;
  shapes: boolean;
  highContrast: boolean;
  autoConnect: boolean;
  /** Tell the server which climbs are lit on the board, for its Recently lit history. The official app always does. */
  logLit: boolean;
  /** Haptic feedback for swiping, the angle dial, sends, attempts and the timer. */
  haptics: boolean;
  /** Count gym and outdoor climbs in the stats (default on). */
  statsOffBoard?: boolean;
  /** Let roped sends count toward the boulder working grade and stats, through `ropedEquivalence`. Off until the user turns it on. */
  ropedWorking: boolean;
  /** The pair the user counts as equal: a roped grade and a boulder grade. */
  ropedEquivalence: RopedEquivalence;
  /** Show the Train tab. */
  trainTab: boolean;
  units: Units;
  /** The "3 more V4s until you have 10" lines. */
  motivation: boolean;
  nudges: NudgeLevel;
  notifications: NotificationPrefs;
  /** The user said no to the system permission request. Kept on this phone only (it is not in a backup), so the app never asks twice. */
  notificationsDeclined: boolean;
}

export const DEFAULT_NOTIFICATIONS: NotificationPrefs = {
  plan: false, planTime: "17:30", review: false, reviewTime: "08:00", streak: false, rest: false, milestone: false, sessionRest: false, quietStart: "21:00", quietEnd: "08:00",
};

export const DEFAULT_SETTINGS: Settings = {
  gradeDisplay: "both", shapes: false, highContrast: false, autoConnect: true, logLit: true, haptics: true,
  ropedWorking: false, ropedEquivalence: DEFAULT_EQUIVALENCE, trainTab: true, units: { weight: "kg", length: "m" }, motivation: true, nudges: "standard", notifications: DEFAULT_NOTIFICATIONS, notificationsDeclined: false,
};

/** Pounds and feet where people use them. `region` is the two-letter country of the phone's locale ("US"). */
export const defaultUnits = (region: string | undefined): Units =>
  region && ["US", "LR", "MM"].includes(region.toUpperCase()) ? { weight: "lb", length: "ft" } : { weight: "kg", length: "m" };

const DISPLAYS: GradeDisplay[] = ["both", "v", "font"];
const NUDGES: NudgeLevel[] = ["off", "relaxed", "standard", "keen"];
const NOTIFICATION_SWITCHES = ["plan", "review", "streak", "rest", "milestone", "sessionRest"] as const;
const NOTIFICATION_TIMES = ["planTime", "reviewTime", "quietStart", "quietEnd"] as const;
const BOOLS = ["shapes", "highContrast", "autoConnect", "logLit", "haptics", "statsOffBoard", "ropedWorking", "trainTab", "motivation", "notificationsDeclined"] as const;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** The valid fields of something that should be settings; anything unknown or out of range is left out. */
export function parseSettings(raw: unknown): Partial<Settings> {
  if (!isObj(raw)) return {};
  const out: Partial<Settings> = {};
  const display = DISPLAYS.find((d) => d === raw.gradeDisplay);
  if (display) out.gradeDisplay = display;
  for (const k of BOOLS) if (typeof raw[k] === "boolean") out[k] = raw[k] as boolean;
  const equivalence = parseEquivalence(raw.ropedEquivalence);
  if (equivalence) out.ropedEquivalence = equivalence;
  const nudges = NUDGES.find((n) => n === raw.nudges);
  if (nudges) out.nudges = nudges;
  if (isObj(raw.units)) {
    const weight = raw.units.weight === "kg" || raw.units.weight === "lb" ? raw.units.weight : null;
    const length = raw.units.length === "m" || raw.units.length === "ft" ? raw.units.length : null;
    // Units only make sense as a pair, so half a pair is dropped.
    if (weight && length) out.units = { weight, length };
  }
  if (isObj(raw.notifications)) {
    const n: Partial<NotificationPrefs> = {};
    for (const k of NOTIFICATION_SWITCHES) if (typeof raw.notifications[k] === "boolean") n[k] = raw.notifications[k] as boolean;
    for (const k of NOTIFICATION_TIMES) { const v = raw.notifications[k]; if (typeof v === "string" && TIME.test(v)) n[k] = v; }
    if (Object.keys(n).length) out.notifications = n as NotificationPrefs;
  }
  return out;
}

/**
 * Settings from a stored copy that may be missing the newest fields. Nested groups merge field by field, so a stored `notifications`
 * with only some keys still gets the rest from `base`.
 */
export function withDefaults(stored: unknown, base: Settings = DEFAULT_SETTINGS): Settings {
  const s = isObj(stored) ? stored : {};
  const parsed = parseSettings(s);
  return {
    ...base,
    ...parsed,
    units: parsed.units ?? base.units,
    notifications: { ...base.notifications, ...(parsed.notifications ?? {}) },
  };
}

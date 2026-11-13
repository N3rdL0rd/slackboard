/** Settings, per-board angles and the training timer, for a backup. Validated field by field: an unknown or bad value is dropped. */
import { parseSettings, type Settings } from "./settings";
import type { TimerConfig } from "./timer";

export interface Preferences {
  settings: Partial<Settings>;
  /** The angle each board was last viewed at, by board id. */
  angles: Record<string, number>;
  timer: TimerConfig | null;
  restSec: number | null;
}

export const EMPTY_PREFS: Preferences = { settings: {}, angles: {}, timer: null, restSec: null };
export const hasPreferences = (p: Preferences): boolean => Object.keys(p.settings).length + Object.keys(p.angles).length > 0 || p.timer !== null || p.restSec !== null;

/** The preferences in the app's stored state. */
export function preferencesOf(s: { settings: Partial<Settings>; angles: Record<string, number>; timer: TimerConfig; restSec: number }): Preferences {
  // Whether this phone refused the notification permission is about this phone, not a preference to carry to another.
  const { notificationsDeclined: _declined, ...settings } = s.settings;
  return { settings, angles: { ...s.angles }, timer: s.timer, restSec: s.restSec };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
const TIMER_KEYS: (keyof TimerConfig)[] = ["prepSec", "workSec", "restSec", "reps", "sets", "setRestSec"];

export function parsePreferences(raw: unknown): Preferences {
  if (!isObj(raw)) return EMPTY_PREFS;
  const { notificationsDeclined: _declined, ...settings } = parseSettings(raw.settings);
  const angles: Record<string, number> = {};
  if (isObj(raw.angles)) {
    let n = 0;
    for (const [id, a] of Object.entries(raw.angles)) {
      const angle = num(a, 0, 90);
      if (id && id.length <= 100 && angle !== null && ++n <= 200) angles[id] = angle;
    }
  }
  let timer: TimerConfig | null = null;
  if (isObj(raw.timer)) {
    const t: Partial<TimerConfig> = {};
    for (const k of TIMER_KEYS) { const v = num(raw.timer[k], 0, 86400); if (v !== null) t[k] = v; }
    if (TIMER_KEYS.every((k) => t[k] !== undefined)) timer = t as TimerConfig;
  }
  return { settings, angles, timer, restSec: num(raw.restSec, 0, 86400) };
}

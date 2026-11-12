/** Settings, per-board angles and the training timer, for a backup. Validated field by field: an unknown or bad value is dropped. */
import type { GradeDisplay } from "./grades";
import type { TimerConfig } from "./timer";

export interface PreferenceSettings {
  gradeDisplay: GradeDisplay;
  shapes: boolean;
  highContrast: boolean;
  autoConnect: boolean;
  autoDisconnectSec: number;
  logLit: boolean;
  haptics: boolean;
  statsOffBoard: boolean;
}

export interface Preferences {
  settings: Partial<PreferenceSettings>;
  /** The angle each board was last viewed at, by board id. */
  angles: Record<string, number>;
  timer: TimerConfig | null;
  restSec: number | null;
}

export const EMPTY_PREFS: Preferences = { settings: {}, angles: {}, timer: null, restSec: null };
export const hasPreferences = (p: Preferences): boolean => Object.keys(p.settings).length + Object.keys(p.angles).length > 0 || p.timer !== null || p.restSec !== null;

/** The preferences in the app's stored state. */
export function preferencesOf(s: { settings: Partial<PreferenceSettings>; angles: Record<string, number>; timer: TimerConfig; restSec: number }): Preferences {
  return { settings: { ...s.settings }, angles: { ...s.angles }, timer: s.timer, restSec: s.restSec };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
const DISPLAYS: GradeDisplay[] = ["both", "v", "font"];
const BOOLS = ["shapes", "highContrast", "autoConnect", "logLit", "haptics", "statsOffBoard"] as const;
const TIMER_KEYS: (keyof TimerConfig)[] = ["prepSec", "workSec", "restSec", "reps", "sets", "setRestSec"];

export function parsePreferences(raw: unknown): Preferences {
  if (!isObj(raw)) return EMPTY_PREFS;
  const settings: Partial<PreferenceSettings> = {};
  if (isObj(raw.settings)) {
    const s = raw.settings;
    const display = DISPLAYS.find((d) => d === s.gradeDisplay);
    if (display) settings.gradeDisplay = display;
    for (const k of BOOLS) if (typeof s[k] === "boolean") settings[k] = s[k] as boolean;
    const sec = num(s.autoDisconnectSec, 0, 3600);
    if (sec !== null) settings.autoDisconnectSec = sec;
  }
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

/**
 * What the watch says. The watch app (wear/) sends small JSON messages through the phone's
 * Data Layer module (modules/slackboard-wear); they wait in an inbox until the app reads them.
 * Everything here is untrusted input: validated, never half-applied.
 *
 * Paths and shapes are defined in wear/.../Protocol.kt.
 */

export const WEAR_PATHS = {
  state: "/slackboard/state",
  pong: "/slackboard/pong",
  hr: "/slackboard/hr",
  summary: "/slackboard/summary",
  capabilities: "/slackboard/capabilities",
  motion: "/slackboard/motion",
  elevation: "/slackboard/elevation",
  stats: "/slackboard/stats",
} as const;

export const MIN_BPM = 20;
export const MAX_BPM = 250;
/** Most samples one message may carry; a watch sends a batch every few seconds. */
export const MAX_BATCH = 5000;

export interface HrSample {
  /** Epoch milliseconds. */
  at: number;
  bpm: number;
}

/** What a watch says it can report (see wear/.../Capabilities.kt). Names are as the watch gives them. */
export interface WatchCapabilities {
  model: string;
  /** Android API level of the watch. */
  sdk: number | null;
  /** Data types for a climbing workout, for live measuring, and for passive monitoring. */
  workout: string[];
  measure: string[];
  passive: string[];
  /** The raw sensors the system lists, such as accelerometer, gyroscope, pressure, heart_rate. */
  sensors: string[];
  /** Whether Samsung's health sensor service is installed; null when the watch could not tell. */
  samsungSensors: boolean | null;
  /** Parts that could not be read, and why. */
  errors: string[];
}

export const MAX_CAPABILITY_ITEMS = 100;

/** One second of motion. Any field is null when the watch had no reading for it. */
export interface MotionRow {
  at: number;
  /** Strength of the arm's acceleration (m/s2, gravity removed) averaged over the second, and its peak. */
  accRms: number | null;
  accMax: number | null;
  /** Strength of the rotation (rad/s) averaged over the second, and its peak. */
  gyroRms: number | null;
  gyroMax: number | null;
  /** Air pressure in hPa, a raw source for height. */
  pressure: number | null;
  /** Gravity through the watch's three axes (m/s2): how the wrist is held. */
  gx: number | null;
  gy: number | null;
  gz: number | null;
}

export interface ElevationSample { at: number; metres: number }

/** Running totals from the workout. */
export interface WorkoutStats {
  calories: number | null;
  /** Elevation gained over the session, in metres. */
  gain: number | null;
  hrAvg: number | null;
  hrMin: number | null;
  hrMax: number | null;
}

export const MIN_PRESSURE = 300;
export const MAX_PRESSURE = 1100;
export const MIN_ELEVATION = -500;
export const MAX_ELEVATION = 9000;

export type WatchMessage =
  | { kind: "motion"; session: string; rows: MotionRow[] }
  | { kind: "elevation"; session: string; samples: ElevationSample[] }
  | { kind: "stats"; session: string; stats: WorkoutStats }
  | { kind: "capabilities"; capabilities: WatchCapabilities }
  | {
      kind: "state";
      /** True when this answered a ping rather than announcing a change. */
      pong: boolean;
      state: "idle" | "running";
      session: string | null;
      startedAt: number | null;
      bpm: number | null;
      error: string | null;
    }
  | { kind: "hr"; session: string; samples: HrSample[] }
  | ({ kind: "summary"; session: string; startedAt: number; endedAt: number } & WorkoutStats);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 100): string | null => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);
const ms = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null);

function parseState(o: Obj, pong: boolean): WatchMessage | null {
  if (o.state !== "idle" && o.state !== "running") return null;
  const bpm = typeof o.bpm === "number" && o.bpm >= MIN_BPM && o.bpm <= MAX_BPM ? Math.round(o.bpm) : null;
  return {
    kind: "state",
    pong,
    state: o.state,
    session: str(o.session),
    startedAt: ms(o.startedAt),
    bpm,
    error: str(o.error, 200),
  };
}

function parseHr(o: Obj): WatchMessage | null {
  const session = str(o.session);
  if (!session || !Array.isArray(o.t) || !Array.isArray(o.b)) return null;
  if (o.t.length !== o.b.length || o.t.length > MAX_BATCH) return null;
  const samples: HrSample[] = [];
  for (let i = 0; i < o.t.length; i++) {
    const at = ms(o.t[i]);
    const bpm = o.b[i];
    // A single bad sample (sensor dropout reads as 0) is dropped, not the whole batch.
    if (at === null || typeof bpm !== "number" || bpm < MIN_BPM || bpm > MAX_BPM) continue;
    samples.push({ at, bpm: Math.round(bpm) });
  }
  return { kind: "hr", session, samples };
}

const names = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 120).slice(0, MAX_CAPABILITY_ITEMS) : [];

function parseCapabilities(o: Obj): WatchMessage | null {
  const model = str(o.model, 60);
  if (!model) return null;
  return {
    kind: "capabilities",
    capabilities: {
      model,
      sdk: typeof o.sdk === "number" && Number.isInteger(o.sdk) && o.sdk > 0 && o.sdk < 1000 ? o.sdk : null,
      workout: names(o.workout),
      measure: names(o.measure),
      passive: names(o.passive),
      sensors: names(o.sensors),
      samsungSensors: typeof o.samsungSensors === "boolean" ? o.samsungSensors : null,
      errors: names(o.errors),
    },
  };
}

const inRange = (v: unknown, lo: number, hi: number, places = 1): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v * 10 ** places) / 10 ** places : null;

/** The totals every workout message can carry. Each is null when it is missing or not believable. */
function statsOf(o: Obj): WorkoutStats {
  const hr = (v: unknown) => inRange(v, MIN_BPM, MAX_BPM);
  return { calories: inRange(o.calories, 0, 20000), gain: inRange(o.gain, 0, 10000), hrAvg: hr(o.hrAvg), hrMin: hr(o.hrMin), hrMax: hr(o.hrMax) };
}

/** Columns of equal length: null for a missing or unbelievable value in a column that may hold nulls. */
function column(v: unknown, n: number, lo: number, hi: number): (number | null)[] | null {
  if (!Array.isArray(v) || v.length !== n) return null;
  return v.map((x) => inRange(x, lo, hi, 3));
}

function parseMotion(o: Obj): WatchMessage | null {
  const session = str(o.session);
  if (!session || !Array.isArray(o.t) || o.t.length > MAX_BATCH) return null;
  const n = o.t.length;
  const a = column(o.a, n, 0, 500), am = column(o.am, n, 0, 500), g = column(o.g, n, 0, 100), gm = column(o.gm, n, 0, 100);
  const p = column(o.p, n, MIN_PRESSURE, MAX_PRESSURE), gx = column(o.gx, n, -50, 50), gy = column(o.gy, n, -50, 50), gz = column(o.gz, n, -50, 50);
  if (!a || !am || !g || !gm || !p || !gx || !gy || !gz) return null;
  const rows: MotionRow[] = [];
  for (let i = 0; i < n; i++) {
    const at = ms(o.t[i]);
    if (at === null) continue;
    rows.push({ at, accRms: a[i], accMax: am[i], gyroRms: g[i], gyroMax: gm[i], pressure: p[i], gx: gx[i], gy: gy[i], gz: gz[i] });
  }
  return { kind: "motion", session, rows };
}

function parseElevation(o: Obj): WatchMessage | null {
  const session = str(o.session);
  if (!session || !Array.isArray(o.t) || !Array.isArray(o.m) || o.t.length !== o.m.length || o.t.length > MAX_BATCH) return null;
  const samples: ElevationSample[] = [];
  for (let i = 0; i < o.t.length; i++) {
    const at = ms(o.t[i]);
    const metres = inRange(o.m[i], MIN_ELEVATION, MAX_ELEVATION, 2);
    if (at !== null && metres !== null) samples.push({ at, metres });
  }
  return { kind: "elevation", session, samples };
}

function parseStats(o: Obj): WatchMessage | null {
  const session = str(o.session);
  return session ? { kind: "stats", session, stats: statsOf(o) } : null;
}

function parseSummary(o: Obj): WatchMessage | null {
  const session = str(o.session);
  const startedAt = ms(o.startedAt);
  const endedAt = ms(o.endedAt);
  if (!session || startedAt === null || endedAt === null || endedAt < startedAt) return null;
  return { kind: "summary", session, startedAt, endedAt, ...statsOf(o) };
}

/** One inbox line: {"path": ..., "data": "<json>", "at": ms}. Null when it is not a usable message. */
export function parseInboxLine(line: string): WatchMessage | null {
  let outer: unknown;
  try {
    outer = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isObj(outer) || typeof outer.path !== "string" || typeof outer.data !== "string") return null;
  let body: unknown;
  try {
    body = JSON.parse(outer.data);
  } catch {
    return null;
  }
  if (!isObj(body)) return null;
  switch (outer.path) {
    case WEAR_PATHS.state:
      return parseState(body, false);
    case WEAR_PATHS.pong:
      return parseState(body, true);
    case WEAR_PATHS.hr:
      return parseHr(body);
    case WEAR_PATHS.summary:
      return parseSummary(body);
    case WEAR_PATHS.capabilities:
      return parseCapabilities(body);
    case WEAR_PATHS.motion:
      return parseMotion(body);
    case WEAR_PATHS.elevation:
      return parseElevation(body);
    case WEAR_PATHS.stats:
      return parseStats(body);
    default:
      return null;
  }
}

export function parseInbox(lines: string[]): { messages: WatchMessage[]; skipped: number } {
  const messages: WatchMessage[] = [];
  let skipped = 0;
  for (const l of lines) {
    const m = parseInboxLine(l);
    if (m) messages.push(m);
    else skipped++;
  }
  return { messages, skipped };
}

/** The watch's report as plain text, for reading and sharing. */
export function describeCapabilities(c: WatchCapabilities): string {
  const list = (title: string, items: string[]) => `${title}: ${items.length ? items.join(", ") : "none reported"}`;
  return [
    `Watch: ${c.model}${c.sdk !== null ? `, Android API ${c.sdk}` : ""}`,
    list("Workout data (climbing)", c.workout),
    list("Live measuring", c.measure),
    list("Passive monitoring", c.passive),
    list("Sensors", c.sensors),
    `Samsung health sensor service: ${c.samsungSensors === null ? "unknown" : c.samsungSensors ? "installed" : "not installed"}`,
    ...(c.errors.length ? [list("Could not read", c.errors)] : []),
  ].join("\n");
}

/** One word for the Settings screen. */
export function watchStatusText(s: { reachable: boolean | null; running: boolean; bpm: number | null }): string {
  if (s.reachable === null) return "Not checked";
  if (!s.reachable) return "No watch with Slackboard found";
  if (s.running) return s.bpm ? `Recording, ${s.bpm} bpm` : "Recording";
  return "Watch connected";
}

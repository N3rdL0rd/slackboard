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

export type WatchMessage =
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
  | { kind: "summary"; session: string; startedAt: number; endedAt: number; calories: number | null };

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

function parseSummary(o: Obj): WatchMessage | null {
  const session = str(o.session);
  const startedAt = ms(o.startedAt);
  const endedAt = ms(o.endedAt);
  if (!session || startedAt === null || endedAt === null || endedAt < startedAt) return null;
  const c = o.calories;
  const calories = typeof c === "number" && Number.isFinite(c) && c >= 0 && c < 20000 ? Math.round(c * 10) / 10 : null;
  return { kind: "summary", session, startedAt, endedAt, calories };
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

/** One word for the Settings screen. */
export function watchStatusText(s: { reachable: boolean | null; running: boolean; bpm: number | null }): string {
  if (s.reachable === null) return "Not checked";
  if (!s.reachable) return "No watch with Slackboard found";
  if (s.running) return s.bpm ? `Recording, ${s.bpm} bpm` : "Recording";
  return "Watch connected";
}

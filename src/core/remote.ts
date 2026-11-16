/**
 * The watch remote's messages. The watch app (wear/) shows the climb or training set the phone is showing, and sends commands back.
 * The phone is the single source of truth: a command is applied here and the result comes back as the next state, so the watch never
 * shows a guess. Everything the watch sends is untrusted: validated, never half-applied.
 *
 * Paths and shapes are mirrored in wear/.../Remote.kt; change both together and bump REMOTE_VERSION when a shape changes, so a phone
 * and watch on different builds say so instead of misreading each other.
 */
import type { GradeBand } from "./grades";
import { isLabelKind, type LabelKind } from "./watchData";

export const REMOTE_VERSION = 1;

export const REMOTE_PATHS = {
  /** Phone to watch: everything the remote shows. */
  state: "/slackboard/remote/state",
  /** Phone to watch: the result of a command that needs an answer. */
  ack: "/slackboard/remote/ack",
  /** Phone to watch: figures for the tile and complication. */
  summary: "/slackboard/remote/summary",
  /** Watch to phone: one command. */
  cmd: "/slackboard/cmd",
} as const;

/** How long the phone keeps sending state after the watch last said it was open. The watch says so every HEARTBEAT_MS. */
export const WATCH_OPEN_MS = 90_000;
export const HEARTBEAT_MS = 30_000;
/** A command older than this when the phone gets to it is dropped: a swipe made a minute ago must not move the climb now. */
export const STALE_MS = 15_000;

/** The timer lengths the climb screen and the watch both offer, in seconds. */
export const CLIMB_TIMER_STEPS = [30, 60, 120, 300, 600];
export const timerStepLabel = (s: number): string => (s < 60 ? `${s} sec` : `${s / 60} min`);

const MAX_TEXT = 60;
const clip = (s: string, n = MAX_TEXT): string => (s.length > n ? s.slice(0, n - 1) + "\u2026" : s);

// ---- What the phone sends ----------------------------------------------------------------------------------------------------------

export interface RemoteClimb {
  id: string;
  name: string;
  /** The grade as the user's setting writes it ("V4"), and the other notation when both are shown ("6b+"); null for a project. */
  grade: string | null;
  alt: string | null;
  /** Colour of the grade numeral, and of the ring, as on the phone's grade chip. */
  numeral: string;
  ring: string;
  angle: number;
  mirrored: boolean;
  canMirror: boolean;
  /** Whole stars, 0 to 3, rounded from the average; null when nobody has rated it. */
  stars: number | null;
  sends: number | null;
  setter: string;
  classic: boolean;
  /** Place in the list the phone is paging through, from 0, and the list's length. */
  index: number;
  count: number;
}

export interface RemoteTimer {
  /** Milliseconds left at the moment of sending; the watch counts down from its own clock. */
  left: number;
  /** Seconds the timer was set for. */
  length: number;
}

export type RunnerPhase = "ready" | "on" | "off" | "work" | "rest" | "finished";

export interface RemoteRunner {
  phase: RunnerPhase;
  /** "Hang", "Rest", "Go"... */
  label: string;
  /** The exercise's name, and where in it the set is. */
  name: string;
  set: number;
  sets: number;
  /** What the set asks for, one line ("10 s on, 3 reps, +10 kg"). */
  target: string;
  /** For `on`, `off` and `rest`: milliseconds left. For `work`: milliseconds spent. Otherwise 0. */
  ms: number;
  paused: boolean;
  /** The next exercise's name, or null on the last. */
  next: string | null;
  color: string;
}

export interface RemoteBoard {
  name: string;
  /** True when a board is connected and is the one the climb is for, so "Light on board" can work. */
  connected: boolean;
}

export interface RemoteState {
  v: number;
  /** The phone's clock when this was built. */
  at: number;
  climb: RemoteClimb | null;
  timer: RemoteTimer | null;
  runner: RemoteRunner | null;
  board: RemoteBoard;
  lengths: number[];
  lastLength: number;
}

export interface ClimbFacts {
  id: string;
  name: string;
  setter: string;
  difficulty: number | null;
  /** The grade written in the user's notation, and the other one when the setting shows both. */
  grade: string | null;
  alt: string | null;
  band: GradeBand | null;
  angle: number;
  mirrored: boolean;
  canMirror: boolean;
  /** Average quality 0 to 3, null when unrated. */
  quality: number | null;
  sends: number | null;
  classic: boolean;
  index: number;
  count: number;
}

const FALLBACK = "#EDEBE4";

/** The numeral takes the band's colour; from V9 the band is black, so the ring colour takes over, as on the phone's grade chip. */
export function climbFace(f: ClimbFacts): RemoteClimb {
  const numeral = f.band ? (f.band.borderWidth ? f.band.text : f.band.fill) : FALLBACK;
  const ring = f.band ? f.band.bar : "#46515A";
  const stars = f.quality == null || !(f.quality > 0) ? null : Math.max(0, Math.min(3, Math.round(f.quality)));
  return {
    id: f.id, name: clip(f.name), grade: f.grade, alt: f.alt, numeral, ring,
    angle: f.angle, mirrored: f.mirrored, canMirror: f.canMirror, stars, sends: f.sends, setter: clip(f.setter), classic: f.classic,
    index: Math.max(0, f.index), count: Math.max(0, f.count),
  };
}

export interface StateInput {
  now: number;
  climb: RemoteClimb | null;
  timerEnd: number | null;
  timerLen: number;
  runner: RemoteRunner | null;
  board: RemoteBoard;
}

export function buildRemoteState(i: StateInput): RemoteState {
  const left = i.timerEnd == null ? null : Math.max(0, i.timerEnd - i.now);
  return {
    v: REMOTE_VERSION, at: i.now, climb: i.climb,
    timer: left == null ? null : { left, length: i.timerLen },
    runner: i.runner,
    board: i.board,
    lengths: CLIMB_TIMER_STEPS,
    lastLength: i.timerLen,
  };
}

/** Today's figures for the watch's tile and complication. */
export interface RemoteSummary {
  v: number;
  streak: number;
  /** "today", "rest", "last", "broken" or "none", as the phone's streak says. */
  streakState: string;
  /** One line about today's plan or nothing, e.g. "Max hangs and pull-ups". */
  today: string | null;
  /** Sends this week. */
  week: number;
}

export function buildSummary(s: Omit<RemoteSummary, "v">): RemoteSummary {
  return { v: REMOTE_VERSION, streak: Math.max(0, Math.floor(s.streak)), streakState: s.streakState, today: s.today ? clip(s.today, 80) : null, week: Math.max(0, Math.floor(s.week)) };
}

// ---- What the watch sends ----------------------------------------------------------------------------------------------------------

export type RunnerOp = "start" | "done" | "skipRest" | "addRest" | "pause" | "resume";
const RUNNER_OPS: RunnerOp[] = ["start", "done", "skipRest", "addRest", "pause", "resume"];

export type RemoteCommand =
  | { cmd: "hello" }
  | { cmd: "bye" }
  | { cmd: "next" }
  | { cmd: "prev" }
  | { cmd: "mirror" }
  | { cmd: "light" }
  | { cmd: "timer-start"; length: number }
  | { cmd: "timer-stop" }
  | { cmd: "log"; send: boolean; tries: number }
  | { cmd: "mark"; kind: LabelKind; session: string; at: number }
  | { cmd: "runner"; op: RunnerOp };

export type ParsedCommand =
  | { ok: true; id: string; command: RemoteCommand }
  | { ok: false; reason: "version" | "invalid"; id: string | null };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const SIMPLE = ["hello", "bye", "next", "prev", "mirror", "light", "timer-stop"] as const;

export const MAX_TRIES = 100;

export function parseCommand(body: unknown): ParsedCommand {
  if (!isObj(body)) return { ok: false, reason: "invalid", id: null };
  const id = typeof body.id === "string" && body.id.length <= 64 ? body.id : "";
  if (body.v !== REMOTE_VERSION) return { ok: false, reason: "version", id: id || null };
  const cmd = body.cmd;
  const bad = { ok: false as const, reason: "invalid" as const, id: id || null };
  if (typeof cmd !== "string") return bad;
  if ((SIMPLE as readonly string[]).includes(cmd)) return { ok: true, id, command: { cmd } as RemoteCommand };
  switch (cmd) {
    case "timer-start": {
      const length = Number(body.length);
      // Only the lengths the screen offers, so a bad value cannot set a timer of a year.
      return CLIMB_TIMER_STEPS.includes(length) ? { ok: true, id, command: { cmd, length } } : bad;
    }
    case "log": {
      const tries = Math.floor(Number(body.tries));
      if (typeof body.send !== "boolean" || !Number.isFinite(tries) || tries < 1 || tries > MAX_TRIES) return bad;
      return { ok: true, id, command: { cmd, send: body.send, tries } };
    }
    case "mark": {
      const at = Number(body.at);
      if (!isLabelKind(body.kind) || typeof body.session !== "string" || !body.session || body.session.length > 64 || !Number.isFinite(at) || at <= 0) return bad;
      return { ok: true, id, command: { cmd, kind: body.kind, session: body.session, at } };
    }
    case "runner":
      return RUNNER_OPS.includes(body.op as RunnerOp) ? { ok: true, id, command: { cmd, op: body.op as RunnerOp } } : bad;
  }
  return bad;
}

/**
 * Whether a command that waited in the inbox is too old to apply. Presence messages and marks are harmless late (a mark carries its own
 * time), so only commands that move something expire.
 */
export function isStale(c: RemoteCommand, receivedAt: number, now: number): boolean {
  if (c.cmd === "hello" || c.cmd === "bye" || c.cmd === "mark") return false;
  return receivedAt > 0 && now - receivedAt > STALE_MS;
}

/** Whether the phone should be sending state: the watch app said it was open recently. */
export const watchIsOpen = (openAt: number | null, now: number): boolean => openAt != null && now - openAt < WATCH_OPEN_MS;

export interface Ack { v: number; id: string; ok: boolean; text: string }
export const buildAck = (id: string, ok: boolean, text: string): Ack => ({ v: REMOTE_VERSION, id, ok, text: clip(text, 80) });

export interface InboxCommand { parsed: ParsedCommand; receivedAt: number }

/** Separates the remote commands from the recorder's messages in what the native inbox holds, so commands can be acted on at once. */
export function splitInbox(lines: string[]): { commands: InboxCommand[]; rest: string[] } {
  const commands: InboxCommand[] = [];
  const rest: string[] = [];
  for (const line of lines) {
    let outer: unknown;
    try { outer = JSON.parse(line); } catch { rest.push(line); continue; }
    if (!isObj(outer) || outer.path !== REMOTE_PATHS.cmd || typeof outer.data !== "string") { rest.push(line); continue; }
    let body: unknown = null;
    try { body = JSON.parse(outer.data); } catch { /* an unreadable body is an invalid command */ }
    const at = typeof outer.at === "number" && Number.isFinite(outer.at) && outer.at > 0 ? outer.at : 0;
    commands.push({ parsed: parseCommand(body), receivedAt: at });
  }
  return { commands, rest };
}

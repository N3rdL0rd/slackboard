import { encodeFrames, setHold, type Frame } from "./frames";
import type { Role } from "./types";

/** Rules for a climb the user is setting, from the official app: 2 to 35 holds, 1 to 2 starts, 1 to 2 finishes. */
export interface SetterRules {
  minHolds: number;
  maxHolds: number;
  /** Most holds that are neither start nor finish; only MoonBoard limits this (14). */
  maxMiddle?: number;
}

export const MAX_NAME_BYTES = 100;
export const MAX_DESCRIPTION_BYTES = 255;
export const MAX_STARTS = 2;
export const MAX_FINISHES = 2;
export const MIN_ROUTE_FRAMES = 5;
export const MAX_ROUTE_FRAMES = 100;
export const MIN_FRAMES_PACE = 1000;
export const MAX_FRAMES_PACE = 60000;
export const DEFAULT_FRAMES_PACE = 10000;
export type ClimbKind = "boulder" | "route";
export interface ClimbDraft {
  /** Every frame; boulders contain exactly one. */
  frames: Frame[];
  /** Initialised by callers from the loaded climb, or the route default. */
  framesPace: number;
  name: string;
  description: string;
}

export const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;

/** "Copy of X", kept inside the name limit (100 bytes) however long and however multi-byte X is. */
export function copyName(name: string): string {
  let out = `Copy of ${name}`;
  while (utf8Bytes(out) > MAX_NAME_BYTES) out = Array.from(out).slice(0, -1).join("");
  return out.trim();
}

export function countRole(holds: Map<number, number>, roles: Role[], name: string): number {
  const ids = new Set(roles.filter((r) => r.name === name).map((r) => r.id));
  let n = 0;
  for (const r of holds.values()) if (ids.has(r)) n++;
  return n;
}

export interface SetterProblem {
  message: string;
  /** The frame to open when the user taps the problem. Undefined for route-wide and detail problems. */
  frameIndex?: number;
}

export interface Check {
  /** Structured problems, in the order the user should fix them. Empty = ready. */
  issues: SetterProblem[];
  /** Compatibility view for the existing boulder status and tests. */
  problems: string[];
  starts: number;
  finishes: number;
  total: number;
}

/** First problem under Save; route issues retain the frame that needs attention. */
export function checkDraft(d: ClimbDraft, roles: Role[], rules: SetterRules, nameTaken: boolean, kind: ClimbKind = "boulder"): Check {
  const issues = kind === "route" ? routeIssues(d.frames, roles, rules) : boulderIssues(d.frames, roles, rules);
  const name = d.name.trim();
  if (!name) issues.push({ message: "Name your climb" });
  else if (utf8Bytes(name) > MAX_NAME_BYTES) issues.push({ message: "The name is too long" });
  else if (nameTaken) issues.push({ message: "That name is already used on this board" });
  if (utf8Bytes(d.description) > MAX_DESCRIPTION_BYTES) issues.push({ message: "The description is too long" });
  return {
    issues,
    problems: issues.map((p) => p.message),
    starts: countRole(d.frames[0] ?? new Map(), roles, "start"),
    finishes: countRole(d.frames[d.frames.length - 1] ?? new Map(), roles, "finish"),
    total: d.frames.reduce((n, f) => n + f.size, 0),
  };
}

export function boulderIssues(frames: Frame[], roles: Role[], rules: SetterRules): SetterProblem[] {
  const issues: SetterProblem[] = [];
  const holds = frames[0] ?? new Map<number, number>();
  const starts = countRole(holds, roles, "start");
  const finishes = countRole(holds, roles, "finish");
  if (frames.length !== 1) issues.push({ message: "A boulder must have exactly 1 frame." });
  if (starts < 1) issues.push({ message: "Add a start hold", frameIndex: 0 });
  if (starts > MAX_STARTS) issues.push({ message: `Use at most ${MAX_STARTS} start holds`, frameIndex: 0 });
  if (finishes < 1) issues.push({ message: "Add a finish hold", frameIndex: 0 });
  if (finishes > MAX_FINISHES) issues.push({ message: `Use at most ${MAX_FINISHES} finish holds`, frameIndex: 0 });
  const middles = holds.size - starts - finishes;
  if (rules.maxMiddle !== undefined && middles > rules.maxMiddle) issues.push({ message: `Use at most ${rules.maxMiddle} middle holds`, frameIndex: 0 });
  if (holds.size < rules.minHolds) issues.push({ message: `Use at least ${rules.minHolds} holds`, frameIndex: 0 });
  if (holds.size > rules.maxHolds) issues.push({ message: `Use at most ${rules.maxHolds} holds`, frameIndex: 0 });
  return issues;
}

/** Exact route hold messages from the official SetClimbViewModel. */
export function routeIssues(frames: Frame[], roles: Role[], rules: SetterRules): SetterProblem[] {
  const issues: SetterProblem[] = [];
  for (const [i, frame] of frames.entries()) {
    if (frame.size < rules.minHolds) issues.push({ message: `There must be at least ${rules.minHolds} hold(s) in each frame of the route.`, frameIndex: i });
    if (frame.size > rules.maxHolds) issues.push({ message: `There must be at most ${rules.maxHolds} hold(s) in each frame of the route.`, frameIndex: i });
  }
  const starts = frames.flatMap((f, i) => [...f.values()].filter((r) => roles.some((role) => role.id === r && role.name === "start")).map(() => i));
  const finishes = frames.flatMap((f, i) => [...f.values()].filter((r) => roles.some((role) => role.id === r && role.name === "finish")).map(() => i));
  if (starts.length < 1) issues.push({ message: "A start hold is on no frames.", frameIndex: 0 });
  if (starts.length > MAX_STARTS) issues.push({ message: `There must be at most ${MAX_STARTS} start holds.` });
  if (finishes.length < 1) issues.push({ message: "A finish hold is on no frames.", frameIndex: Math.max(0, frames.length - 1) });
  if (finishes.length > MAX_FINISHES) issues.push({ message: `There must be at most ${MAX_FINISHES} finish holds.` });
  if (starts.some((i) => i !== 0)) issues.push({ message: "Start holds must be on the first frame.", frameIndex: starts.find((i) => i !== 0) });
  if (finishes.some((i) => i !== frames.length - 1)) issues.push({ message: "Finish holds must be on the last frame.", frameIndex: finishes.find((i) => i !== frames.length - 1) });
  if (frames.length < MIN_ROUTE_FRAMES) issues.push({ message: `A route must have at least ${MIN_ROUTE_FRAMES} frames.` });
  if (frames.length > MAX_ROUTE_FRAMES) issues.push({ message: `A route must have at most ${MAX_ROUTE_FRAMES} frames.` });
  return issues;
}


export const tapHold = setHold;

/** Placements sorted by id within each frame; the server accepts the full encoding. */
export const framesString = (frames: Frame[] | Map<number, number>): string => encodeFrames(Array.isArray(frames) ? frames : [frames]);

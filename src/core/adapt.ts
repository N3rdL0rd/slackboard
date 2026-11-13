/**
 * Adapting the plan to what was logged. Pure and deterministic, and conservative: it can add a little when things felt easy, but it
 * never adds when anything pointed the other way, and pain always overrides. Each change comes with a plain reason, which the Today card
 * and the session show. The rules:
 *
 * - Last time felt easy (at least half of the rated sets, none hard, no effort of 9 or more): a little more load, or a smaller edge.
 * - Felt right, or no ratings: follow the schedule.
 * - Mostly hard, or effort 9 or more: hold at last time's load or edge. All sets hard: step back a little.
 * - Sharp finger pain: no finger work for 7 days. Sore fingers, low energy, or a big climbing day yesterday: a lighter version.
 * - Sessions missed: they are marked skipped and the week carries on; nothing is crammed into fewer days.
 */
import { fingerHoldOff, noteFor, type DayNote } from "./body";
import type { Activity } from "./activity";
import { addDays, daysBetween, type Day } from "./days";
import { isHardDay, typicalDayEntries, type WorkingGrades } from "./load";
import { isFingerIntense, lighten, sessionMinutes, type BlockKind, type Plan, type PlanSession, type Tests } from "./planner";
import type { TestKind } from "../data/protocols";
import type { Emphasis } from "./styleProfile";
import { lastTime, type TrainingEntry } from "./training";
import { exerciseById } from "../data/exercises";

/** A little more load: one kilogram, or two millimetres less edge when every rated set was easy. */
export const LOAD_STEP_KG = 1;
export const EDGE_STEP_MM = 1;
/** Effort at or above this counts as a hard session whatever the ratings say. */
export const HARD_EFFORT = 9;
/** Energy (1 to 5) at or below this is a low day. */
export const LOW_ENERGY = 2;

export interface AdaptContext {
  today: Day;
  entries: TrainingEntry[];
  notes: DayNote[];
  activities: Activity[];
  working: WorkingGrades;
  blockKind: BlockKind;
}

export interface Adapted { session: PlanSession; reasons: string[] }

const HANGS = ["max-hang", "min-edge-hang"];
const isWorkSet = (t: { timeS: number | null }) => t.timeS !== null && t.timeS >= 7;

type Verdict = "progress" | "hold" | "back" | "follow";

/** What last time says about this exercise: progress, hold, step back, or follow the schedule. */
export function verdictFor(prev: TrainingEntry | undefined): { verdict: Verdict; easyAll: boolean } {
  if (!prev) return { verdict: "follow", easyAll: false };
  const work = prev.sets.filter((s) => s.done && isWorkSet(s));
  const rated = work.filter((s) => s.feel !== null);
  // Ratings are optional; with fewer than half the sets rated there is not enough to go on.
  if (work.length === 0 || rated.length < Math.ceil(work.length / 2)) return { verdict: (prev.effort ?? 0) >= HARD_EFFORT ? "hold" : "follow", easyAll: false };
  const hard = rated.filter((s) => s.feel === "hard").length;
  const easy = rated.filter((s) => s.feel === "easy").length;
  const half = Math.ceil(rated.length / 2);
  const tiring = (prev.effort ?? 0) >= HARD_EFFORT;
  if (hard === rated.length) return { verdict: "back", easyAll: false };
  if (hard >= half || tiring) return { verdict: "hold", easyAll: false };
  if (easy >= half && hard === 0) return { verdict: "progress", easyAll: easy === rated.length };
  return { verdict: "follow", easyAll: false };
}

/** Rebuilds the ramp-up sets of a loaded hang from its new working load. Ramp sets are the leading short, easy sets. */
function withLoad(sets: PlanSession["items"][number]["sets"], load: number, edge: number | null) {
  const isRamp = (t: (typeof sets)[number]) => t.onS === 5 && t.restS === 60;
  let r = 0;
  while (r < sets.length && isRamp(sets[r])) r++;
  const ramps = r < sets.length ? r : 0;
  const shares = [0.5, 0.75];
  return sets.map((t, i) => {
    if (i < ramps) return load > 0 ? { ...t, loadKg: Math.round(load * shares[Math.min(i, 1)] * 2) / 2 } : t;
    return { ...t, loadKg: load, edgeMm: edge ?? t.edgeMm };
  });
}

function progress(s: PlanSession, ctx: AdaptContext, reasons: string[]): PlanSession {
  if (s.light) return s;
  const items = s.items.map((item) => {
    if (!HANGS.includes(item.exerciseId)) return item;
    const prev = lastTime(ctx.entries, item.exerciseId);
    const { verdict, easyAll } = verdictFor(prev);
    if (verdict === "follow" || !prev) return item;
    const lastWork = [...prev.sets].reverse().find((t) => t.done && isWorkSet(t));
    const planned = item.sets.find((t) => t.onS === 10) ?? item.sets[item.sets.length - 1];
    if (!lastWork) return item;
    const name = exerciseById(item.exerciseId)?.name ?? "this exercise";
    const loaded = item.exerciseId === "max-hang";
    if (loaded) {
      const last = lastWork.loadKg ?? 0;
      const plannedLoad = planned.loadKg ?? 0;
      let load = plannedLoad;
      if (verdict === "progress" && ctx.blockKind !== "starter") load = Math.max(plannedLoad, last + LOAD_STEP_KG);
      else if (verdict === "hold") load = Math.min(plannedLoad, last);
      else if (verdict === "back") load = Math.min(plannedLoad, last) - LOAD_STEP_KG;
      if (ctx.blockKind === "starter") load = Math.min(load, 0);
      if (load === plannedLoad) return item;
      reasons.push(load > plannedLoad ? `${name} felt easy last time, so a little more: ${load} kg.` : `${name} was hard last time, so ${verdict === "hold" ? "holding at" : "stepping back to"} ${load} kg.`);
      return { ...item, sets: withLoad(item.sets, load, null) };
    }
    const lastEdge = lastWork.edgeMm ?? planned.edgeMm ?? 20;
    const plannedEdge = planned.edgeMm ?? lastEdge;
    let edge = plannedEdge;
    if (verdict === "progress") edge = Math.min(plannedEdge, lastEdge - (easyAll ? 2 * EDGE_STEP_MM : EDGE_STEP_MM));
    else if (verdict === "hold") edge = Math.max(plannedEdge, lastEdge);
    else if (verdict === "back") edge = Math.max(plannedEdge, lastEdge + EDGE_STEP_MM);
    if (edge === plannedEdge) return item;
    reasons.push(edge < plannedEdge ? `${name} felt easy last time, so a smaller edge: ${edge} mm.` : `${name} was hard last time, so ${verdict === "hold" ? "staying on" : "going back to"} ${edge} mm.`);
    return { ...item, sets: item.sets.map((t) => (t.onS === 10 || (t.onS !== null && t.onS >= 7) ? { ...t, edgeMm: edge } : { ...t, edgeMm: edge + 2 })) };
  });
  return { ...s, items, minutes: sessionMinutes(items) };
}

const withReasons = (s: PlanSession, reasons: string[]): PlanSession => (reasons.length ? { ...s, why: [...s.why, ...reasons] } : s);

/** The session as it should be done today, given how recent training felt, the body notes, energy and recent climbing. */
export function adaptSession(session: PlanSession, ctx: AdaptContext): Adapted {
  if (session.status !== "planned") return { session, reasons: [] };
  const reasons: string[] = [];
  const finger = isFingerIntense(session.slot);

  // Sharp finger pain overrides everything: no finger work, a light session instead.
  const hold = fingerHoldOff(ctx.notes, ctx.today);
  if (finger && hold.holdOff) {
    const items = session.items.filter((i) => i.exerciseId === "climbing-warm-up" || i.exerciseId === "hip-thoracic-mobility");
    const base = items.some((i) => i.exerciseId === "hip-thoracic-mobility") ? items : [...items, { exerciseId: "hip-thoracic-mobility", sets: [{ reps: null, onS: 60, offS: null, restS: 20, loadKg: null, edgeMm: null, grip: null }, { reps: null, onS: 60, offS: null, restS: 20, loadKg: null, edgeMm: null, grip: null }] }];
    const r = [`You noted sharp finger pain, so finger work is held off${hold.until ? ` until ${hold.until}` : ""}. This is a light session instead.`];
    return { session: { ...session, title: "Light session", items: base, light: true, minutes: sessionMinutes(base), why: [...session.why, ...r] }, reasons: r };
  }

  let s = progress(session, ctx, reasons);

  // One lighter version at most, for the first of: sore fingers, low energy, a big climbing day yesterday.
  const note = noteFor(ctx.notes, ctx.today);
  const yesterday = addDays(ctx.today, -1);
  const yEntries = ctx.activities.filter((a) => a.day === yesterday && a.kind !== "training");
  let lighter: string | null = null;
  if (finger && note?.fingers === "sore") lighter = "Your fingers are sore today, so fewer sets and a lighter load.";
  else if (note?.energy != null && note.energy <= LOW_ENERGY && !s.light) lighter = "Your energy is low today, so a lighter version of the session.";
  else if (finger && !s.light && yEntries.length > 0 && isHardDay(yEntries, ctx.working, typicalDayEntries(ctx.activities))) lighter = "Yesterday was a big day of climbing, so a lighter session today.";
  if (lighter && !s.light) { s = lighten(s); reasons.push(lighter); }
  return { session: withReasons(s, reasons.filter((x) => x === lighter)), reasons };
}

/** Marks sessions whose day has passed without being done as skipped. They are not moved or crammed in; the week simply carries on. */
export function settleMissed(plan: Plan, today: Day): { plan: Plan; changed: boolean } {
  let changed = false;
  const sessions = plan.sessions.map((s) => {
    if (s.status === "planned" && s.day < today) { changed = true; return { ...s, status: "skipped" as const }; }
    return s;
  });
  return { plan: changed ? { ...plan, sessions } : plan, changed };
}

// ---- Retests and the next block -----------------------------------------------------------------------------------------------

export interface TestRecord { id: string; test: TestKind; value: number; takenAt: string }
export interface RetestChange { test: TestKind; before: number; after: number; delta: number; percent: number | null }

const lastDay = (plan: Plan): Day => addDays(plan.startDay, plan.block.weeks * 7 - 1);

/** The last week of the block is the retest week: from its first day, a retest is offered. */
export const retestDue = (plan: Plan, today: Day): boolean => plan.status === "active" && today >= addDays(plan.startDay, 7 * (plan.block.retestWeek - 1));

/** The block has ended. */
export const blockOver = (plan: Plan, today: Day): boolean => plan.status === "active" && today > lastDay(plan);

/** Each test taken before the plan began and again since, with the change. A test without both is left out. */
export function retestReport(plan: Plan, results: TestRecord[]): RetestChange[] {
  const out: RetestChange[] = [];
  for (const test of ["hang7", "hangFail", "pullups", "legRaises"] as TestKind[]) {
    const mine = results.filter((r) => r.test === test);
    const before = mine.filter((r) => r.takenAt <= plan.createdAt).sort((a, b) => b.takenAt.localeCompare(a.takenAt))[0];
    const after = mine.filter((r) => r.takenAt > plan.createdAt).sort((a, b) => b.takenAt.localeCompare(a.takenAt))[0];
    if (!before || !after) continue;
    const delta = after.value - before.value;
    out.push({ test, before: before.value, after: after.value, delta, percent: before.value > 0 ? (delta / before.value) * 100 : null });
  }
  return out;
}

export interface NextBlock { emphasis: Emphasis; lines: string[] }

/** What the next block should emphasise, from how the retest went. Blocks alternate; a stall repeats the same one gently. */
export function nextBlockProposal(plan: Plan, report: RetestChange[]): NextBlock {
  const finger = report.find((r) => r.test === "hang7");
  const alternate: Emphasis = plan.block.emphasis === "strength" ? "endurance" : "strength";
  const lines: string[] = [];
  if (!finger) {
    lines.push("There is no before-and-after finger test, so this is the usual next step: blocks alternate between strength and endurance.");
    return { emphasis: alternate, lines };
  }
  const pct = finger.percent;
  const shown = pct === null ? `${finger.delta >= 0 ? "+" : ""}${finger.delta} kg` : `${pct >= 0 ? "+" : ""}${Math.round(pct)}%`;
  if (pct !== null && pct >= 5) {
    lines.push(`Your 7-second hang went ${shown}. That is a real gain, so the next block turns to ${alternate === "endurance" ? "endurance" : "strength"} work.`);
    return { emphasis: alternate, lines };
  }
  lines.push(`Your 7-second hang changed by ${shown}. Strength comes slowly, and a flat result is normal.`);
  lines.push(`The next block stays on ${plan.block.emphasis === "balanced" ? "balanced work" : plan.block.emphasis} with a gentler first week. A rest week first is fine too.`);
  return { emphasis: plan.block.emphasis, lines };
}

export const daysLeftInBlock = (plan: Plan, today: Day): number => Math.max(0, daysBetween(today, lastDay(plan)) + 1);
export type { Tests };

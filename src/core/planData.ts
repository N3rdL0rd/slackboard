/**
 * Reading profiles, test results and plans from untrusted input (a backup file, or a stored row that no longer fits). Every field is
 * checked: types, ranges, known ids and values. Anything that fails is refused whole and counted, never half-read, so a damaged plan can
 * never reach the screens or the session runner.
 */
import { EQUIPMENT, exerciseById, GRIP_LABEL, type Equipment, type Grip } from "../data/exercises";
import type { TestKind } from "../data/protocols";
import { isDay, weekdayOf } from "./days";
import type { Block, FingerHistory, Plan, PlanPhase, PlanSession, PlanStatus, Profile, SessionStatus, SlotKind, TestResult, BlockKind, PhaseFocus } from "./planner";
import type { RunnerItem } from "./sessionRunner";
import type { Emphasis } from "./styleProfile";
import { MAX_EDGE_MM, MAX_LOAD_KG, MAX_REPS, MAX_SETS, MAX_TIME_S, type SetTarget } from "./training";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const int = (v: unknown, lo: number, hi: number): number | null => (typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : null);
const real = (v: unknown, lo: number, hi: number): number | null => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.length <= max ? v : null);
const STAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | null => (list.includes(v as T) ? (v as T) : null);

const SLOTS: SlotKind[] = ["finger", "pullcore", "endurance", "mobility"];
const STATUSES: SessionStatus[] = ["planned", "done", "skipped"];
const PLAN_STATUSES: PlanStatus[] = ["active", "paused", "done"];
const BLOCKS: BlockKind[] = ["starter", "strength", "endurance", "balanced"];
const FOCUSES: PhaseFocus[] = ["starter", "weight", "edge", "repeaters", "intermittent"];
const EMPHASES: Emphasis[] = ["strength", "endurance", "balanced"];
const HISTORIES: FingerHistory[] = ["new", "some", "regular"];
const TEST_KINDS: TestKind[] = ["hang7", "hangFail", "pullups", "legRaises"];
const EQUIPMENT_IDS = EQUIPMENT.map((e) => e.value);
const GRIPS = Object.keys(GRIP_LABEL) as Grip[];

/** Reads a nullable number: missing or null is null, a bad value is `undefined` (the whole record is refused). */
function opt(v: unknown, f: (x: unknown) => number | null): number | null | undefined {
  if (v === null || v === undefined) return null;
  return f(v) ?? undefined;
}

export function parseProfile(v: unknown): Profile | null {
  if (!isObj(v)) return null;
  const bodyKg = opt(v.bodyKg, (x) => real(x, 20, 300));
  const fingerHistory = oneOf(v.fingerHistory, HISTORIES);
  const injury = str(v.injury, 500);
  const daysPerWeek = int(v.daysPerWeek, 1, 6);
  const minutes = int(v.minutes, 20, 180);
  const noEmphasis = v.emphasis === null || v.emphasis === undefined;
  const emphasis = noEmphasis ? null : oneOf(v.emphasis, EMPHASES);
  const goalDate = v.goalDate === null || v.goalDate === undefined ? null : typeof v.goalDate === "string" && isDay(v.goalDate) ? v.goalDate : undefined;
  const days = (x: unknown): number[] | null => (Array.isArray(x) && x.length <= 7 && x.every((d) => int(d, 0, 6) !== null) ? [...new Set(x as number[])].sort((a, b) => a - b) : null);
  const equipment = Array.isArray(v.equipment) && v.equipment.length <= 10 && v.equipment.every((e) => EQUIPMENT_IDS.includes(e as Equipment)) ? ([...new Set(v.equipment)] as Equipment[]) : null;
  const trainDays = days(v.trainDays);
  const climbDays = days(v.climbDays);
  if (bodyKg === undefined || !fingerHistory || injury === null || !daysPerWeek || !minutes || (!noEmphasis && emphasis === null) || goalDate === undefined || !equipment || !trainDays || !climbDays) return null;
  return { bodyKg, fingerHistory, equipment, injury, daysPerWeek, minutes, trainDays, climbDays, emphasis, goalDate };
}

export function parseTestResult(v: unknown): TestResult | null {
  if (!isObj(v)) return null;
  const test = oneOf(v.test, TEST_KINDS);
  const value = real(v.value, -200, 5000);
  if (typeof v.id !== "string" || !v.id || v.id.length > 100 || !test || value === null || typeof v.takenAt !== "string" || !STAMP.test(v.takenAt)) return null;
  // Only the 7-second test can be negative (assisted); the others count something.
  if (test !== "hang7" && value < 0) return null;
  return { id: v.id, test, value, takenAt: v.takenAt };
}

function parseTarget(v: unknown): SetTarget | null {
  if (!isObj(v)) return null;
  const reps = opt(v.reps, (x) => int(x, 1, MAX_REPS));
  const onS = opt(v.onS, (x) => real(x, 1, MAX_TIME_S));
  const offS = opt(v.offS, (x) => real(x, 0, MAX_TIME_S));
  const loadKg = opt(v.loadKg, (x) => real(x, -MAX_LOAD_KG, MAX_LOAD_KG));
  const edgeMm = opt(v.edgeMm, (x) => real(x, 1, MAX_EDGE_MM));
  const restS = real(v.restS, 0, MAX_TIME_S);
  const grip = v.grip === null || v.grip === undefined ? null : oneOf(v.grip, GRIPS);
  if ([reps, onS, offS, loadKg, edgeMm].includes(undefined) || restS === null || (v.grip !== null && v.grip !== undefined && grip === null)) return null;
  return { reps: reps ?? null, onS: onS ?? null, offS: offS ?? null, restS, loadKg: loadKg ?? null, edgeMm: edgeMm ?? null, grip: grip ?? null };
}

function parseItem(v: unknown): RunnerItem | null {
  if (!isObj(v) || typeof v.exerciseId !== "string" || !exerciseById(v.exerciseId) || !Array.isArray(v.sets) || v.sets.length < 1 || v.sets.length > MAX_SETS) return null;
  const sets: SetTarget[] = [];
  for (const raw of v.sets) { const t = parseTarget(raw); if (!t) return null; sets.push(t); }
  return { exerciseId: v.exerciseId, sets };
}

export function parsePlanSession(v: unknown): PlanSession | null {
  if (!isObj(v)) return null;
  const week = int(v.week, 1, 12);
  const slot = oneOf(v.slot, SLOTS);
  const status = oneOf(v.status, STATUSES);
  const minutes = int(v.minutes, 0, 600);
  const title = str(v.title, 60);
  const movedFrom = v.movedFrom === null || v.movedFrom === undefined ? null : typeof v.movedFrom === "string" && isDay(v.movedFrom) ? v.movedFrom : undefined;
  if (typeof v.id !== "string" || !v.id || v.id.length > 100 || typeof v.day !== "string" || !isDay(v.day) || !week || !slot || !status || minutes === null || title === null || movedFrom === undefined || typeof v.light !== "boolean") return null;
  if (!Array.isArray(v.items) || v.items.length < 1 || v.items.length > 20 || !Array.isArray(v.why) || v.why.length > 12 || !v.why.every((w) => str(w, 400) !== null)) return null;
  const items: RunnerItem[] = [];
  for (const raw of v.items) { const i = parseItem(raw); if (!i) return null; items.push(i); }
  return { id: v.id, day: v.day, week, slot, title, items, status, movedFrom, light: v.light, minutes, why: v.why as string[] };
}

function parseBlock(v: unknown): Block | null {
  if (!isObj(v)) return null;
  const kind = oneOf(v.kind, BLOCKS);
  const emphasis = oneOf(v.emphasis, EMPHASES);
  const weeks = int(v.weeks, 6, 12);
  const retestWeek = int(v.retestWeek, 1, 12);
  if (!kind || !emphasis || !weeks || !retestWeek || !Array.isArray(v.phases) || v.phases.length < 1 || v.phases.length > 4 || !Array.isArray(v.deloadWeeks) || !Array.isArray(v.reasons) || v.reasons.length > 12) return null;
  const phases: PlanPhase[] = [];
  for (const p of v.phases) {
    if (!isObj(p)) return null;
    const focus = oneOf(p.focus, FOCUSES);
    const name = str(p.name, 60);
    const startWeek = int(p.startWeek, 1, 12);
    const pw = int(p.weeks, 1, 12);
    if (!focus || name === null || !startWeek || !pw) return null;
    phases.push({ focus, name, startWeek, weeks: pw });
  }
  const deloadWeeks = v.deloadWeeks.map((w) => int(w, 1, 12));
  if (deloadWeeks.some((w) => w === null) || !v.reasons.every((r) => str(r, 400) !== null)) return null;
  return { kind, weeks, emphasis, phases, deloadWeeks: deloadWeeks as number[], retestWeek, reasons: v.reasons as string[] };
}

export function parsePlan(v: unknown): Plan | null {
  if (!isObj(v)) return null;
  const block = parseBlock(v.block);
  const status = oneOf(v.status, PLAN_STATUSES);
  if (typeof v.id !== "string" || !v.id || v.id.length > 100 || !block || !status || typeof v.startDay !== "string" || !isDay(v.startDay) || weekdayOf(v.startDay) !== 0) return null;
  if (typeof v.createdAt !== "string" || !STAMP.test(v.createdAt) || !Array.isArray(v.sessions) || v.sessions.length > 200) return null;
  const sessions: PlanSession[] = [];
  const seen = new Set<string>();
  for (const raw of v.sessions) {
    const s = parsePlanSession(raw);
    if (!s || seen.has(s.id)) return null;
    seen.add(s.id);
    sessions.push(s);
  }
  return { id: v.id, startDay: v.startDay, block, status, createdAt: v.createdAt, sessions };
}

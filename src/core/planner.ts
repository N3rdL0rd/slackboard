/**
 * The planner: from a profile, the logs' style insight and any tests, it chooses a block of 6 to 12 weeks, lays out each week around the
 * days the user already climbs, and writes every session from the exercise library. Pure and deterministic: the same inputs always give
 * the same plan, so a plan can be explained and tested. It is deliberately cautious. A person new to finger training, or with an injury
 * noted, starts on a gentle block; finger-intense sessions are at least 48 hours apart; every week keeps a rest day; and every decision
 * carries a reason the user can read. It never schedules technique sessions and never picks climbs or changes a grade.
 */
import { canDo, exerciseById, type Equipment, type Exercise } from "../data/exercises";
import {
  DEFAULT_EDGE_MM, DEFAULT_MARGIN_S, DELOAD_LOAD_FACTOR, DELOAD_SET_FACTOR, EDGE_STEPS_MM, FIRST_WEEK_FACTOR, MARGIN_PERCENT_PER_S, percentOfMax7, RAMP_SHARES, SET_BUILD,
  STARTER_EDGE_MM, type TestKind,
} from "../data/protocols";
import { addDays, daysBetween, weekdayOf, weekStartDay, type Day } from "./days";
import { setSeconds, type RunnerItem } from "./sessionRunner";
import type { Emphasis } from "./styleProfile";
import { targetsFromTemplate, type SetTarget } from "./training";
import { roundTo } from "./units";

export type { Emphasis };
export type FingerHistory = "new" | "some" | "regular";
export type SlotKind = "finger" | "pullcore" | "endurance" | "mobility";
export type BlockKind = "starter" | "strength" | "endurance" | "balanced";
export type PhaseFocus = "starter" | "weight" | "edge" | "repeaters" | "intermittent";
export type PlanStatus = "active" | "paused" | "done";
export type SessionStatus = "planned" | "done" | "skipped";

export const MIN_WEEKS = 6;
export const MAX_WEEKS = 12;
export const DEFAULT_WEEKS = 8;
export const STARTER_WEEKS = 6;
/** At least this many days between finger-intense sessions (48 hours). */
export const MIN_FINGER_GAP_DAYS = 2;

export interface Profile {
  /** For load advice. Without it, loads are worked out from the added weight alone, which is less exact. */
  bodyKg: number | null;
  fingerHistory: FingerHistory;
  equipment: Equipment[];
  /** Anything to be careful about. Any text here starts the plan gently. */
  injury: string;
  daysPerWeek: number;
  minutes: number;
  /** Weekdays (Monday is 0) that can hold a planned session. */
  trainDays: number[];
  /** Weekdays the user already climbs (roped or bouldering), shown as their own days. */
  climbDays: number[];
  /** The user's own view of what they need. It outranks what the logs say. */
  emphasis: Emphasis | null;
  /** A trip or goal date that shapes the block's length. */
  goalDate: Day | null;
}

export const DEFAULT_PROFILE: Profile = {
  bodyKg: null, fingerHistory: "some", equipment: ["hangboard", "pullupBar"], injury: "", daysPerWeek: 3, minutes: 60,
  trainDays: [0, 2, 4], climbDays: [1, 5], emphasis: null, goalDate: null,
};

export interface TestResult { id: string; test: TestKind; value: number; takenAt: string }
export type Tests = Partial<Record<TestKind, number>>;

/** The newest result of each test. */
export function latestTests(results: TestResult[]): Tests {
  const out: Tests = {};
  const newest = new Map<TestKind, string>();
  for (const r of results) {
    if (!newest.has(r.test) || r.takenAt > newest.get(r.test)!) { newest.set(r.test, r.takenAt); out[r.test] = r.value; }
  }
  return out;
}

export interface PlanPhase { focus: PhaseFocus; name: string; startWeek: number; weeks: number }

export interface Block {
  kind: BlockKind;
  weeks: number;
  emphasis: Emphasis;
  phases: PlanPhase[];
  /** Weeks (from 1) that are lighter. The last week is always one, and the retest week. */
  deloadWeeks: number[];
  retestWeek: number;
  reasons: string[];
}

export interface PlanSession {
  id: string;
  day: Day;
  /** The week of the block, from 1. */
  week: number;
  slot: SlotKind;
  title: string;
  items: RunnerItem[];
  status: SessionStatus;
  movedFrom: Day | null;
  light: boolean;
  minutes: number;
  why: string[];
}

export interface Plan {
  id: string;
  /** The Monday the block starts on. */
  startDay: Day;
  block: Block;
  status: PlanStatus;
  createdAt: string;
  sessions: PlanSession[];
}

export const isFingerIntense = (s: SlotKind): boolean => s === "finger" || s === "endurance";

// ---- Choosing a block ---------------------------------------------------------------------------------------------------------

/** A block starts on Monday: this week early in the week, next week from Friday on, so week 1 is never a single day. */
export const planStart = (today: Day): Day => (weekdayOf(today) >= 4 ? addDays(weekStartDay(today), 7) : weekStartDay(today));

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function chooseBlock(profile: Profile, logsEmphasis: Emphasis | "unknown", today: Day): Block {
  const reasons: string[] = [];
  const emphasis: Emphasis = profile.emphasis ?? (logsEmphasis === "unknown" ? "balanced" : logsEmphasis);
  if (profile.emphasis) reasons.push(`You said ${profile.emphasis === "strength" ? "strength" : profile.emphasis === "endurance" ? "endurance" : "balance"} is what you need, and that outranks what your log shows.`);
  else if (logsEmphasis === "unknown") reasons.push("There is too little in your log to point to anything, so this is balanced work.");

  const careful = profile.fingerHistory === "new" || profile.injury.trim() !== "";
  const kind: BlockKind = careful ? "starter" : emphasis;
  if (profile.fingerHistory === "new") reasons.push("You are new to finger training, so the block starts gently: bigger edges, fewer sets, and no added weight.");
  if (profile.injury.trim() !== "") reasons.push("You noted something to be careful about, so the block starts gently. Stop at once if anything hurts, and ask a physio about pain that stays.");

  const start = planStart(today);
  let weeks = kind === "starter" ? STARTER_WEEKS : DEFAULT_WEEKS;
  if (profile.goalDate) {
    weeks = clamp(Math.ceil((daysBetween(start, profile.goalDate) + 1) / 7), MIN_WEEKS, MAX_WEEKS);
    reasons.push(`The block is ${weeks} weeks so its last week lands at your date.`);
  }

  const half = Math.floor(weeks / 2);
  const phases: PlanPhase[] =
    kind === "starter" ? [{ focus: "starter", name: "Starter hangs", startWeek: 1, weeks }]
    : kind === "strength" ? [{ focus: "weight", name: "Hangs with added weight", startWeek: 1, weeks: half }, { focus: "edge", name: "Hangs on a smaller edge", startWeek: half + 1, weeks: weeks - half }]
    : kind === "endurance" ? [{ focus: "repeaters", name: "Repeaters", startWeek: 1, weeks: half }, { focus: "intermittent", name: "Intermittent hangs", startWeek: half + 1, weeks: weeks - half }]
    : [{ focus: "weight", name: "Hangs with added weight", startWeek: 1, weeks: half }, { focus: "repeaters", name: "Repeaters", startWeek: half + 1, weeks: weeks - half }];
  if (kind === "strength") reasons.push("Strength is the limiter, so the block is max hangs first on added weight, then on a smaller edge, with pulling and core.");
  if (kind === "endurance") reasons.push("Endurance is the limiter, so the block is repeaters, then longer intermittent hangs.");
  if (kind === "balanced") reasons.push("Nothing stands out as the limiter, so the block is strength first, then endurance.");

  const deload = new Set<number>([weeks]);
  for (let w = 4; w <= weeks; w += 4) deload.add(w);
  reasons.push("Every fourth week is lighter, and the last week is a light week to retest in.");
  return { kind, weeks, emphasis, phases, deloadWeeks: [...deload].sort((a, b) => a - b), retestWeek: weeks, reasons };
}

export const phaseOfWeek = (block: Block, week: number): PlanPhase => block.phases.find((p) => week >= p.startWeek && week < p.startWeek + p.weeks) ?? block.phases[block.phases.length - 1];

// ---- Laying out a week --------------------------------------------------------------------------------------------------------

/** The session types for a week, most important first, as many as the user has days for. */
export function slotsForWeek(focus: PhaseFocus, deload: boolean, p: Profile): SlotKind[] {
  const n = Math.min(Math.max(1, p.daysPerWeek), p.trainDays.length);
  const hang: SlotKind = focus === "repeaters" || focus === "intermittent" ? "endurance" : "finger";
  if (deload) return (["finger", "pullcore", "mobility"] as SlotKind[]).map((s) => (s === "finger" ? hang : s)).slice(0, n);
  const maxFinger = focus !== "starter" && p.fingerHistory === "regular" && n >= 5 ? 3 : 2;
  const order: SlotKind[] = [hang, "pullcore", hang, "mobility", "pullcore", maxFinger === 3 ? hang : "mobility"];
  const out: SlotKind[] = [];
  let finger = 0;
  for (const s of order) {
    if (out.length >= n) break;
    if (isFingerIntense(s) && ++finger > maxFinger) continue;
    out.push(s);
  }
  return out;
}

export interface WeekLayout {
  placed: { weekday: number; slot: SlotKind }[];
  /** Slots there was no good day for. */
  dropped: SlotKind[];
  /** Days with neither a session nor the user's own climbing. */
  restDays: number[];
}

/**
 * Puts the week's sessions on days. Finger-intense sessions go first and are at least 48 hours apart, including from the last one of the
 * week before; the rest fill in around them, avoiding the user's own climbing days and the day before a finger session. A week always
 * keeps a rest day when it can: if it would not, the least important session is dropped.
 */
export function layoutWeek(input: { trainDays: number[]; climbDays: number[]; slots: SlotKind[]; prevFingerGap: number | null }): WeekLayout {
  const train = [...new Set(input.trainDays)].sort((a, b) => a - b);
  const climb = new Set(input.climbDays);
  const placed: { weekday: number; slot: SlotKind; rank: number }[] = [];
  const dropped: SlotKind[] = [];
  const taken = (d: number) => placed.some((x) => x.weekday === d);
  const fingerDays = () => placed.filter((x) => isFingerIntense(x.slot)).map((x) => x.weekday);

  const fingerOk = (d: number) => fingerDays().every((f) => Math.abs(f - d) >= MIN_FINGER_GAP_DAYS) && (input.prevFingerGap === null || d + input.prevFingerGap >= MIN_FINGER_GAP_DAYS);

  const order = input.slots.map((slot, rank) => ({ slot, rank }));
  for (const pass of [true, false]) {
    for (const { slot, rank } of order.filter((o) => isFingerIntense(o.slot) === pass)) {
      const free = train.filter((d) => !taken(d) && (!isFingerIntense(slot) || fingerOk(d)));
      if (!free.length) { dropped.push(slot); continue; }
      const score = (d: number): number => {
        let s = climb.has(d) ? 10 : 0;
        if (!isFingerIntense(slot)) {
          if (fingerDays().includes(d + 1)) s += 5; // the day before a finger session
          if (slot === "mobility" && fingerDays().includes(d - 1)) s -= 3; // an easy day after a hard one
        }
        return s;
      };
      const day = free.reduce((a, b) => (score(b) < score(a) ? b : a));
      placed.push({ weekday: day, slot, rank });
    }
  }

  const rest = () => [0, 1, 2, 3, 4, 5, 6].filter((d) => !taken(d) && !climb.has(d));
  while (rest().length < 1 && placed.length > 0) {
    // No rest day: the least important session goes.
    placed.sort((a, b) => a.rank - b.rank);
    dropped.push(placed.pop()!.slot);
  }
  placed.sort((a, b) => a.weekday - b.weekday);
  return { placed: placed.map(({ weekday, slot }) => ({ weekday, slot })), dropped, restDays: rest() };
}

// ---- Writing a session --------------------------------------------------------------------------------------------------------

/** The load of a hang of `seconds`, as added weight, from the 7-second test. Null when there is no test. */
export function hangLoad(input: { hang7: number | null | undefined; bodyKg: number | null; seconds: number; marginS: number; factor: number }): { loadKg: number; percent: number } | null {
  if (input.hang7 === null || input.hang7 === undefined) return null;
  const percent = percentOfMax7(input.seconds) * (1 - input.marginS * MARGIN_PERCENT_PER_S) * input.factor;
  // With body weight the percentage applies to everything hanging; without it, to the added weight alone (a rougher guess).
  const load = input.bodyKg !== null ? percent * (input.bodyKg + input.hang7) - input.bodyKg : input.hang7 >= 0 ? percent * input.hang7 : input.hang7 * (2 - percent);
  return { loadKg: roundTo(load, 0.5), percent };
}

const TIME_PER_REP_S = 3;
const WARM_UP_ID = "climbing-warm-up";

export const sessionMinutes = (items: RunnerItem[]): number =>
  Math.round(items.reduce((n, i) => n + i.sets.reduce((m, t) => m + (t.onS !== null ? setSeconds(t) : (t.reps ?? 8) * TIME_PER_REP_S) + t.restS, 0), 0) / 60);

const counted = (reps: number, restS: number, loadKg: number | null = null): SetTarget => ({ reps, onS: null, offS: null, restS, loadKg, edgeMm: null, grip: null });
const held = (onS: number, restS: number): SetTarget => ({ reps: null, onS, offS: null, restS, loadKg: null, edgeMm: null, grip: null });
const times = (n: number, t: SetTarget): SetTarget[] => Array.from({ length: n }, () => ({ ...t }));
const item = (id: string, sets: SetTarget[]): RunnerItem => ({ exerciseId: id, sets });

export interface SessionInput {
  slot: SlotKind;
  focus: PhaseFocus;
  /** The week of the block (from 1) and of the phase (from 0). */
  week: number;
  weekInPhase: number;
  deload: boolean;
  profile: Profile;
  tests: Tests;
}

export interface SessionDraft { title: string; items: RunnerItem[]; minutes: number; light: boolean; why: string[] }

const TITLES: Record<SlotKind, string> = { finger: "Finger strength", pullcore: "Pull and core", endurance: "Finger endurance", mobility: "Mobility" };

function antagonist(have: Equipment[], sets: number): RunnerItem | null {
  const pick = (["face-pull", "scapular-pull-up", "push-up"] as const).find((id) => canDo(exerciseById(id)!, have));
  return pick ? item(pick, times(sets, { ...targetsFromTemplate(exerciseById(pick)!)[0] })) : null;
}

/** One session, with the reasons for its numbers. Items the user has no equipment for are swapped for ones they can do. */
export function generateSession(input: SessionInput): SessionDraft {
  const { slot, focus, week, weekInPhase, deload, profile, tests } = input;
  const have = profile.equipment;
  const why: string[] = [];
  const drops: RunnerItem[] = []; // trimmed first, in this order, when the session is longer than the user's time
  const items: RunnerItem[] = [];
  const warm = (): RunnerItem => item(WARM_UP_ID, targetsFromTemplate(exerciseById(WARM_UP_ID)!).slice(0, 1));
  const starter = focus === "starter";
  const setCount = (build: number) => (starter ? 2 : deload ? Math.max(2, Math.round(build * DELOAD_SET_FACTOR)) : build);
  const build = SET_BUILD[Math.min(weekInPhase, SET_BUILD.length - 1)];

  let effective: SlotKind = slot;
  if (isFingerIntense(slot) && !have.includes("hangboard")) {
    effective = "pullcore";
    why.push("You have no hangboard in your equipment, so this session is pulling and core work instead.");
  }

  if (isFingerIntense(effective)) {
    items.push(warm());
    const id = effective === "endurance" ? (focus === "intermittent" ? "intermittent-hang" : "repeaters") : focus === "edge" ? "min-edge-hang" : "max-hang";
    const ex = exerciseById(id)!;
    const grip = "halfCrimp" as const;
    if (effective === "finger") {
      const hasTest = tests.hang7 !== undefined;
      const edge = starter ? STARTER_EDGE_MM[profile.fingerHistory] : focus === "edge" ? (hasTest ? EDGE_STEPS_MM[Math.min(weekInPhase, EDGE_STEPS_MM.length - 1)] : Math.max(20, DEFAULT_EDGE_MM - weekInPhase)) : hasTest ? 20 : DEFAULT_EDGE_MM;
      const factor = (week === 1 ? FIRST_WEEK_FACTOR : 1) * (deload ? DELOAD_LOAD_FACTOR : 1);
      const calc = focus === "edge" || starter ? null : hangLoad({ hang7: tests.hang7, bodyKg: profile.bodyKg, seconds: 10, marginS: DEFAULT_MARGIN_S, factor });
      const load = calc ? calc.loadKg : 0;
      const work: SetTarget = { reps: null, onS: 10, offS: null, restS: 180, loadKg: load, edgeMm: edge, grip };
      const ramp: SetTarget[] = RAMP_SHARES.map((share, i) => (
        load > 0 ? { ...work, onS: 5, restS: 60, loadKg: roundTo(load * share, 0.5) }
        : { ...work, onS: 5, restS: 60, loadKg: 0, edgeMm: edge + (RAMP_SHARES.length - i) * 2 }
      ));
      items.push(item(id, [...ramp, ...times(setCount(build), work)]));
      why.push(starter ? `Starter hangs: ${edge} mm, no added weight, ${setCount(build)} work sets. Use a pulley or bands if it is too hard.` : focus === "edge" ? `Hangs on a ${edge} mm edge with no added weight, ${setCount(build)} sets.` : calc ? `Load is ${Math.round(percentOfMax7(10) * 100)}% of your 7-second max for a 10 second hang, less a ${DEFAULT_MARGIN_S} second margin (about ${Math.round(calc.percent * 100)}% in all)${week === 1 ? ", and lighter in the first week" : ""}${deload ? ", and lighter in a light week" : ""}.` : `No test yet, so hangs are bodyweight on a ${edge} mm edge. A test would let the plan use real loads.`);
      why.push("Two ramp-up sets come first, then rest about three minutes between hangs.");
    } else {
      const base = targetsFromTemplate(ex)[0];
      const sets = starter ? 2 : deload ? Math.max(2, Math.round(3 * DELOAD_SET_FACTOR)) : weekInPhase >= 2 ? 4 : 3;
      items.push(item(id, times(sets, { ...base, edgeMm: tests.hang7 !== undefined ? 20 : DEFAULT_EDGE_MM, loadKg: 0 })));
      why.push(focus === "intermittent" ? "Intermittent hangs: 5 hangs of 10 seconds on and 5 off per set, which builds the stamina to stay on small holds." : "Repeaters: 6 hangs of 7 seconds on and 3 off per set, the endurance work with the best published results.");
    }
    const a = antagonist(have, 2);
    if (a) { items.push(a); drops.push(a); }
    why.push("Fingers are rested: finger sessions are at least 48 hours apart.");
  } else if (effective === "pullcore") {
    const pullups = tests.pullups;
    if (!starter && have.includes("pullupBar") && have.includes("weights") && pullups !== undefined && pullups >= 8) {
      const load = clamp(roundTo((pullups - 8) * 1.25 + 2.5, 0.5), 2.5, 30);
      items.push(item("weighted-pull-up", times(setCount(Math.min(4, build + 1)), counted(5, 150, deload ? roundTo(load * DELOAD_LOAD_FACTOR, 0.5) : load))));
      why.push(`Weighted pull-ups at +${load} kg, a rough start from your ${pullups} pull-ups. Adjust it to what 5 hard reps feels like.`);
    } else if (have.includes("pullupBar")) {
      items.push(item("pull-up-ladder", times(setCount(3), counted(pullups !== undefined ? clamp(Math.round(pullups * 0.6), 3, 8) : 5, 90))));
      why.push("Pull-up ladders add volume gently while you build up.");
    } else {
      items.push(item("push-up", times(setCount(3), counted(12, 90))));
      why.push("No pull-up bar, so push-ups keep the shoulders balanced.");
    }
    const core = have.includes("pullupBar") ? item("hanging-leg-raise", times(setCount(3), counted(clamp(Math.round((tests.legRaises ?? 8) * 0.7), 5, 15), 90))) : item("plank", times(setCount(3), held(45, 60)));
    items.push(core); drops.push(core);
    const a = antagonist(have, 3);
    if (a && !items.some((i) => i.exerciseId === a.exerciseId)) { items.push(a); drops.unshift(a); }
  } else {
    items.push(warm());
    items.push(item("hip-thoracic-mobility", times(2, held(60, 20))));
    why.push("A light day: mobility only, to recover between the harder sessions.");
  }

  // Fit the user's time: drop the extras first (shoulder work, then core), never the main work or the warm-up.
  let minutes = sessionMinutes(items);
  for (const d of drops) {
    if (minutes <= profile.minutes) break;
    items.splice(items.indexOf(d), 1);
    minutes = sessionMinutes(items);
  }
  if (minutes > profile.minutes) why.push(`About ${minutes} minutes, a little over your ${profile.minutes}. Trim the rest times if you need to.`);
  const light = deload || effective === "mobility";
  if (deload) why.push("A light week: fewer sets and lighter loads, to recover before the next push.");
  return { title: TITLES[effective], items, minutes, light, why };
}

// ---- Building a plan ----------------------------------------------------------------------------------------------------------

export interface BuildInput {
  id: string;
  today: Day;
  now: Date;
  profile: Profile;
  tests: Tests;
  logsEmphasis: Emphasis | "unknown";
  newId: () => string;
  createdAt: string;
}

/** Every session of the block from today on, week by week. Sessions before today are not written. */
export function buildPlan(input: BuildInput): Plan {
  const { profile, tests } = input;
  const block = chooseBlock(profile, input.logsEmphasis, input.today);
  const startDay = planStart(input.today);
  const sessions: PlanSession[] = [];
  let lastFingerWeekday: number | null = null;
  for (let week = 1; week <= block.weeks; week++) {
    const phase = phaseOfWeek(block, week);
    const deload = block.deloadWeeks.includes(week);
    const slots = slotsForWeek(phase.focus, deload, profile);
    const layout = layoutWeek({ trainDays: profile.trainDays, climbDays: profile.climbDays, slots, prevFingerGap: lastFingerWeekday === null ? null : 7 - lastFingerWeekday });
    const weekStart = addDays(startDay, 7 * (week - 1));
    for (const { weekday, slot } of layout.placed) {
      const day = addDays(weekStart, weekday);
      if (day < input.today) continue;
      const draft = generateSession({ slot, focus: phase.focus, week, weekInPhase: week - phase.startWeek, deload, profile, tests });
      sessions.push({ id: input.newId(), day, week, slot, title: draft.title, items: draft.items, status: "planned", movedFrom: null, light: draft.light, minutes: draft.minutes, why: [`Week ${week} of ${block.weeks}: ${phase.name}.`, ...draft.why] });
    }
    const fingerDays = layout.placed.filter((x) => isFingerIntense(x.slot)).map((x) => x.weekday);
    if (fingerDays.length) lastFingerWeekday = Math.max(...fingerDays); else if (lastFingerWeekday !== null) lastFingerWeekday -= 7;
  }
  return { id: input.id, startDay, block, status: "active", createdAt: input.createdAt, sessions: sessions.sort((a, b) => a.day.localeCompare(b.day) || a.id.localeCompare(b.id)) };
}

// ---- Following a plan ---------------------------------------------------------------------------------------------------------

/** Today's session, if one is still to do. */
export const todaysSession = (plan: Plan, today: Day): PlanSession | null => (plan.status === "active" ? plan.sessions.find((s) => s.day === today && s.status === "planned") ?? null : null);

/** The next session still to do, from today. */
export const nextSession = (plan: Plan, today: Day): PlanSession | null => (plan.status === "active" ? plan.sessions.find((s) => s.day >= today && s.status === "planned") ?? null : null);

export const sessionsInWeek = (plan: Plan, weekStart: Day): PlanSession[] => plan.sessions.filter((s) => s.day >= weekStart && s.day <= addDays(weekStart, 6));

export const updateSession = (plan: Plan, id: string, f: (s: PlanSession) => PlanSession): Plan => ({ ...plan, sessions: plan.sessions.map((s) => (s.id === id ? f(s) : s)) });

export const skipSession = (plan: Plan, id: string): Plan => updateSession(plan, id, (s) => ({ ...s, status: "skipped" }));
export const completeSession = (plan: Plan, id: string): Plan => updateSession(plan, id, (s) => ({ ...s, status: "done" }));

/** The ramp-up sets at the start of a hang item: short, easy sets that come before the work sets. */
function rampCount(sets: SetTarget[]): number {
  const isRamp = (t: SetTarget) => t.onS === 5 && t.restS === 60;
  let n = 0;
  while (n < sets.length && isRamp(sets[n])) n++;
  return n < sets.length ? n : 0;
}

/** A lighter version of a session: about a third fewer work sets (never below one) and a tenth less load, marked light. Ramp sets stay. */
export function lighten(s: PlanSession): PlanSession {
  const items = s.items.map((i) => {
    const ramps = rampCount(i.sets);
    const work = i.sets.slice(ramps);
    const keep = Math.max(1, Math.round(work.length * DELOAD_SET_FACTOR));
    const sets = [...i.sets.slice(0, ramps), ...work.slice(0, keep)].map((t) => ({ ...t, loadKg: t.loadKg === null || t.loadKg <= 0 ? t.loadKg : roundTo(t.loadKg * DELOAD_LOAD_FACTOR, 0.5) }));
    return { ...i, sets };
  });
  return { ...s, items, light: true, minutes: sessionMinutes(items), why: [...s.why, "Made lighter: fewer sets and a tenth less load."] };
}

const WEEKDAY = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const weekdayName = (day: Day): string => WEEKDAY[weekdayOf(day)];

export type MoveResult = { ok: true; plan: Plan } | { ok: false; reason: string; nearest: Day | null };

/** Why a session can't go on `day`, or null when it can. */
function moveProblem(plan: Plan, s: PlanSession, day: Day, today: Day): string | null {
  if (day < today) return "That day has passed.";
  const others = plan.sessions.filter((x) => x.id !== s.id && x.status !== "skipped");
  if (others.some((x) => x.day === day)) return `There is already a session on ${weekdayName(day)}.`;
  if (isFingerIntense(s.slot)) {
    const near = others.find((x) => isFingerIntense(x.slot) && Math.abs(daysBetween(x.day, day)) < MIN_FINGER_GAP_DAYS);
    if (near) return `Too close to ${weekdayName(near.day)}'s finger session: fingers need 48 hours.`;
  }
  return null;
}

/** The closest day to `around` where the session can go, looking up to a week either way. */
export function nearestGoodDay(plan: Plan, s: PlanSession, around: Day, today: Day): Day | null {
  for (let d = 1; d <= 7; d++) {
    for (const day of [addDays(around, d), addDays(around, -d)]) if (moveProblem(plan, s, day, today) === null) return day;
  }
  return null;
}

/** Moves a session to another day, or says why it can't and where it could go instead. */
export function moveSession(plan: Plan, id: string, to: Day, today: Day): MoveResult {
  const s = plan.sessions.find((x) => x.id === id);
  if (!s || s.status !== "planned") return { ok: false, reason: "That session is already done or skipped.", nearest: null };
  const problem = moveProblem(plan, s, to, today);
  if (problem) return { ok: false, reason: problem, nearest: nearestGoodDay(plan, s, to, today) };
  const next = updateSession(plan, id, (x) => ({ ...x, day: to, movedFrom: x.movedFrom ?? x.day }));
  return { ok: true, plan: { ...next, sessions: [...next.sessions].sort((a, b) => a.day.localeCompare(b.day) || a.id.localeCompare(b.id)) } };
}

/** Up to four other exercises of the same kind that the user can do, for "Swap". */
export function alternativesFor(exerciseId: string, have: Equipment[], library: Exercise[], max = 4): Exercise[] {
  const ex = exerciseById(exerciseId);
  if (!ex) return [];
  return library.filter((e) => e.id !== exerciseId && e.category === ex.category && e.category !== "power" && canDo(e, have)).slice(0, max);
}

/** Swaps one exercise for another, keeping the number of sets and starting from the new exercise's own numbers. */
export function swapExercise(s: PlanSession, fromId: string, toId: string): PlanSession {
  const to = exerciseById(toId);
  if (!to) return s;
  const items = s.items.map((i) => (i.exerciseId === fromId ? item(toId, times(i.sets.length, targetsFromTemplate(to)[0])) : i));
  return { ...s, items, minutes: sessionMinutes(items), why: [...s.why, `Swapped for ${to.name}.`] };
}

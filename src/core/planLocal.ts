import type { Db } from "./db";
import { parsePlan, parsePlanSession, parseProfile, parseTestResult } from "./planData";
import type { Plan, Profile, TestResult } from "./planner";
import { stampOf } from "./days";

/** The saved profile, or null when none is saved or the saved one no longer reads. */
export async function loadProfile(db: Db): Promise<Profile | null> {
  const row = (await db.all<{ profile_json: string }>("SELECT profile_json FROM l_profile WHERE id = 1"))[0];
  if (!row) return null;
  try { return parseProfile(JSON.parse(row.profile_json)); } catch { return null; }
}

export async function saveProfile(db: Db, p: Profile, now: Date = new Date()): Promise<void> {
  await db.run("INSERT OR REPLACE INTO l_profile (id, profile_json, updated_at) VALUES (1, ?, ?)", [JSON.stringify(p), stampOf(now)]);
}

/** Every test result, newest first. A row that no longer reads is left out. */
export async function loadTests(db: Db): Promise<TestResult[]> {
  const rows = await db.all<{ id: string; test: string; value: number; taken_at: string }>("SELECT id, test, value, taken_at FROM l_tests ORDER BY taken_at DESC, id");
  return rows.flatMap((r) => parseTestResult({ id: r.id, test: r.test, value: r.value, takenAt: r.taken_at }) ?? []);
}

export async function saveTest(db: Db, t: TestResult): Promise<void> {
  await db.run("INSERT OR REPLACE INTO l_tests (id, test, value, taken_at) VALUES (?, ?, ?, ?)", [t.id, t.test, t.value, t.takenAt]);
}

export async function deleteTest(db: Db, id: string): Promise<void> {
  await db.run("DELETE FROM l_tests WHERE id = ?", [id]);
}

interface PlanRow { id: string; start_day: string; block_json: string; status: string; created_at: string }
interface SessionRow { id: string; plan_id: string; day: string; week: number; slot: string; title: string; items_json: string; status: string; moved_from: string | null; light: number; minutes: number; why_json: string }

const json = (s: string): unknown => { try { return JSON.parse(s); } catch { return undefined; } };

/** Every plan with its sessions, newest first. A plan or session that no longer reads is left out (a damaged session drops only itself). */
export async function loadPlans(db: Db): Promise<Plan[]> {
  const plans = await db.all<PlanRow>("SELECT id, start_day, block_json, status, created_at FROM l_plans ORDER BY created_at DESC, id");
  const sessions = await db.all<SessionRow>("SELECT id, plan_id, day, week, slot, title, items_json, status, moved_from, light, minutes, why_json FROM l_plan_sessions ORDER BY day, id");
  const by = new Map<string, unknown[]>();
  for (const r of sessions) {
    const s = parsePlanSession({ id: r.id, day: r.day, week: r.week, slot: r.slot, title: r.title, items: json(r.items_json), status: r.status, movedFrom: r.moved_from, light: r.light === 1, minutes: r.minutes, why: json(r.why_json) });
    if (s) (by.get(r.plan_id) ?? by.set(r.plan_id, []).get(r.plan_id)!).push(s);
  }
  return plans.flatMap((p) => parsePlan({ id: p.id, startDay: p.start_day, block: json(p.block_json), status: p.status, createdAt: p.created_at, sessions: by.get(p.id) ?? [] }) ?? []);
}

/** Inserts or replaces a plan and all its sessions, together or not at all. */
export async function savePlan(db: Db, plan: Plan): Promise<void> {
  await db.transaction(async () => {
    await db.run("INSERT OR REPLACE INTO l_plans (id, start_day, block_json, status, created_at) VALUES (?, ?, ?, ?, ?)", [plan.id, plan.startDay, JSON.stringify(plan.block), plan.status, plan.createdAt]);
    await db.run("DELETE FROM l_plan_sessions WHERE plan_id = ?", [plan.id]);
    for (const s of plan.sessions) {
      await db.run(
        "INSERT INTO l_plan_sessions (id, plan_id, day, week, slot, title, items_json, status, moved_from, light, minutes, why_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [s.id, plan.id, s.day, s.week, s.slot, s.title, JSON.stringify(s.items), s.status, s.movedFrom, s.light ? 1 : 0, s.minutes, JSON.stringify(s.why)],
      );
    }
  });
}

export async function deletePlan(db: Db, id: string): Promise<void> {
  await db.transaction(async () => {
    await db.run("DELETE FROM l_plan_sessions WHERE plan_id = ?", [id]);
    await db.run("DELETE FROM l_plans WHERE id = ?", [id]);
  });
}

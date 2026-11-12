/**
 * MoonBoard is a local-only provider (providers/moonboard.ts): no account, no server. "Signing in" is just creating the
 * single local user the first time a board is added, and everything is written to the phone's database straight away.
 */
import { Directory, File, Paths } from "expo-file-system";
import * as SQLite from "expo-sqlite";
import { create } from "zustand";
import { sourceFor, targetOfLayout } from "../core/moonSources";
import {
  climbCount, createBoard, deleteBoard, ensureSeeded, esrSetups, importProblems, LOCAL_USER_ID, LOCAL_USERNAME, readEsr, renameBoard, wipe, type ImportCounts,
} from "../core/moonLocal";
import { layoutIdOf, problemFromRecord, RecordSplitter, setupByKey, type MoonProblem, type MoonSetup } from "../core/moonboard";
import { setMeta } from "../core/sync";
import { getDb, wrap } from "../data/sqlite";
import { useData } from "./data";
import { homeLocation } from "./boards";
import { refreshUserData } from "./outbox";
import { placeNewBoard } from "./spaces";
import { useStore } from "./store";
import { INITIAL_KEY, useSync } from "./sync";

export const MOON = "moonboard";

/** The board a MoonBoard list belongs to. */
export interface MoonTarget { setup: MoonSetup; angle: number }

/** MoonBoard has no sign-in: the single local user is created the first time it is needed. Safe to call again. */
export async function startLocalAccount(): Promise<void> {
  if (useStore.getState().accounts[MOON]) return;
  await setMeta(await getDb(MOON), INITIAL_KEY, "1");
  useStore.getState().signIn(MOON, LOCAL_USERNAME, LOCAL_USER_ID);
  await useSync.getState().checkInitial();
}

export async function addMoonBoard(input: { name: string; setupKey: string; angle: number }): Promise<{ uuid: string; layoutId: number }> {
  const setup = setupByKey(input.setupKey);
  if (!setup || !setup.angles.includes(input.angle)) throw new Error("That setup doesn't come at that angle.");
  const db = await getDb(MOON);
  const uuid = await createBoard(db, { name: input.name.trim() || setup.name, setup, angle: input.angle });
  await startLocalAccount();
  await refreshUserData();
  await placeNewBoard(uuid, { gymName: null, location: await homeLocation() });
  useStore.getState().setBoard(uuid);
  return { uuid, layoutId: layoutIdOf(setup, input.angle) };
}

export async function renameMoonBoard(uuid: string, name: string): Promise<void> {
  await renameBoard(await getDb(MOON), uuid, name.trim());
  await refreshUserData();
}

/** Removes a board. Its problems and logs stay, so adding the board again brings them back. */
export async function removeMoonBoard(uuid: string): Promise<void> {
  await deleteBoard(await getDb(MOON), uuid);
  if (useStore.getState().boardId === uuid) useStore.getState().setBoard("");
  await refreshUserData();
}

/** Forgets everything MoonBoard has on this phone: boards, problems and logs. */
export async function removeMoonData(): Promise<void> {
  await wipe(await getDb(MOON));
  useStore.getState().signOut(MOON);
  useSync.getState().forget(MOON);
  await useData.getState().loadAll(useStore.getState().accounts);
}

// ---------------------------------------------------------------------------------------------------------------------
// Problems: downloaded and imported automatically the first time a board needs them.

export type ProblemsPhase = "downloading" | "importing" | "done" | "error";
export interface ProblemsStatus { phase: ProblemsPhase; fraction: number; error?: string }

/** Keyed by layout id. In memory only: the database itself says whether a list is already there. */
export const useProblems = create<{ by: Record<number, ProblemsStatus> }>(() => ({ by: {} }));
const setStatus = (layout: number, s: ProblemsStatus) => useProblems.setState((st) => ({ by: { ...st.by, [layout]: s } }));
const inflight = new Map<number, Promise<void>>();

/**
 * Makes sure a board's problem list is on the phone. Does nothing when it is already there or a run is under way, so it is
 * safe to call on every launch and every time a board is opened; a failed run (usually no connection) is simply tried again.
 */
export function ensureProblems(layoutId: number): Promise<void> {
  // A second caller (the Add-board screen, the launch check) waits for the run already under way instead of starting another.
  const existing = inflight.get(layoutId);
  if (existing) return existing;
  const run = fetchProblems(layoutId).finally(() => inflight.delete(layoutId));
  inflight.set(layoutId, run);
  return run;
}

async function fetchProblems(layoutId: number): Promise<void> {
  const target = targetOfLayout(layoutId);
  const source = target && sourceFor(target.setup.key, target.angle);
  if (!target || !source) return;
  const db = await getDb(MOON);
  // A board made by an earlier build gets the hold art and the setting limits it lacks.
  if (await ensureSeeded(db, target.setup, target.angle)) await refreshUserData();
  if ((await climbCount(db, target.setup, target.angle)) > 0) { setStatus(layoutId, { phase: "done", fraction: 1 }); return; }
  const file = new File(Paths.cache, `moon-${target.setup.key}-${target.angle}.${source.format === "sqlite" ? "db" : "json"}`);
  try {
    setStatus(layoutId, { phase: "downloading", fraction: 0 });
    if (file.exists) file.delete();
    await File.downloadFileAsync(source.url, file);
    setStatus(layoutId, { phase: "importing", fraction: 0 });
    await importDump(file, source.format, target, (fraction) => setStatus(layoutId, { phase: "importing", fraction }));
    setStatus(layoutId, { phase: "done", fraction: 1 });
  } catch (e) {
    setStatus(layoutId, { phase: "error", fraction: 0, error: (e as Error).message });
  } finally {
    if (file.exists) file.delete();
  }
}

export interface ImportResult extends ImportCounts {
  /** Records that were not problems at all. */
  unreadable: number;
}

const BATCH = 400;
const SLICE = 1 << 20;
const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Adds a dump file's problems to a setup's list. `onProgress` gets a fraction between 0 and 1. */
export async function importDump(file: File, format: "json" | "sqlite", target: MoonTarget, onProgress: (fraction: number) => void): Promise<ImportResult> {
  const db = await getDb(MOON);
  const total: ImportResult = { added: 0, skipped: 0, ungraded: 0, unreadable: 0 };
  const flush = async (batch: MoonProblem[]) => {
    const c = await importProblems(db, target.setup, target.angle, batch);
    total.added += c.added; total.skipped += c.skipped; total.ungraded += c.ungraded;
  };

  if (format === "sqlite") await importSqlite(file, target, flush, onProgress);
  else {
    const text = await file.text();
    const splitter = new RecordSplitter();
    let batch: MoonProblem[] = [];
    for (let at = 0; at < text.length; at += SLICE) {
      for (const record of splitter.push(text.slice(at, at + SLICE))) {
        let problem: MoonProblem | null = null;
        try { problem = problemFromRecord(JSON.parse(record)); } catch { /* counted below */ }
        if (problem) batch.push(problem); else total.unreadable++;
        if (batch.length >= BATCH) { await flush(batch); batch = []; }
      }
      onProgress(Math.min(1, (at + SLICE) / text.length));
      await yieldToUi();
    }
    if (batch.length) await flush(batch);
  }
  if (total.added === 0) throw new Error("The problem list had no problems in it.");
  await refreshUserData();
  useSync.setState((s) => ({ version: s.version + 1 }));
  return total;
}

/** The community database is a SQLite file; expo-sqlite opens files in its own directory, so it is copied there for the import. */
async function importSqlite(file: File, target: MoonTarget, flush: (b: MoonProblem[]) => Promise<void>, onProgress: (f: number) => void) {
  const copy = new File(new Directory(`file://${SQLite.defaultDatabaseDirectory}`), "slackboard-import.db");
  await file.copy(copy, { overwrite: true });
  const raw = await SQLite.openDatabaseAsync("slackboard-import.db");
  try {
    const db = wrap(raw);
    const found = await esrSetups(db);
    const setup = found.find((s) => target.setup.match.test(s.setup));
    if (!setup) throw new Error(`That database has no ${target.setup.name} problems.`);
    let done = 0;
    for await (const batch of readEsr(db, setup.setup)) {
      await flush(batch);
      done += batch.length;
      onProgress(Math.min(1, done / setup.problems));
      await yieldToUi();
    }
  } finally {
    await raw.closeAsync();
    copy.delete();
  }
}

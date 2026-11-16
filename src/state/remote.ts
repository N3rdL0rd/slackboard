import { useEffect } from "react";
import { create } from "zustand";
import Wear from "../../modules/slackboard-wear";
import { buildAck, buildRemoteState, buildSummary, isStale, REMOTE_PATHS, splitInbox, watchIsOpen, type RemoteClimb, type RemoteRunner } from "../core/remote";
import { dispatch, type ClimbControls, type Controls, type RunnerControls } from "../core/remoteDispatch";
import { saveSessionLabel } from "../core/watchLocal";
import { randomHex } from "../core/api";
import { getLocalDb } from "../data/sqlite";
import { weekStartDay } from "../core/days";
import { todaysSession } from "../core/planner";
import { useClimbTimer } from "./climbTimer";
import { useCurrentPlan } from "./planner";
import { useActivities, useToday, useTodayInfo } from "./today";

/**
 * The phone's side of the watch remote. The open climb screen (or training session) publishes what it shows and registers what it can
 * do; this sends the state to the watch while the watch app is open, and applies the watch's commands. See core/remote.ts.
 */
interface RemoteStore {
  climb: RemoteClimb | null;
  runner: RemoteRunner | null;
  board: { name: string; connected: boolean };
  climbControls: ClimbControls | null;
  runnerControls: RunnerControls | null;
  /** When the watch last said its app was open (heartbeat), or null. */
  openAt: number | null;
  /** Today's figures for the watch's tile and complication, sent when they change. */
  summary: { streak: number; streakState: string; today: string | null; week: number } | null;
  publishClimb: (c: RemoteClimb | null, board: { name: string; connected: boolean }) => void;
  publishRunner: (r: RemoteRunner | null) => void;
  setClimbControls: (c: ClimbControls | null) => void;
  setRunnerControls: (c: RunnerControls | null) => void;
  setSummary: (s: RemoteStore["summary"]) => void;
}

const NO_BOARD = { name: "", connected: false };

export const useRemote = create<RemoteStore>((set) => ({
  climb: null,
  runner: null,
  board: NO_BOARD,
  climbControls: null,
  runnerControls: null,
  openAt: null,
  summary: null,
  publishClimb: (climb, board) => set({ climb, board }),
  publishRunner: (runner) => set({ runner }),
  setClimbControls: (climbControls) => set({ climbControls }),
  setRunnerControls: (runnerControls) => set({ runnerControls }),
  setSummary: (summary) => set({ summary }),
}));

const controls = (): Controls => {
  const s = useRemote.getState();
  const timer = useClimbTimer.getState();
  return {
    climb: s.climbControls,
    runner: s.runnerControls,
    timer: { start: timer.start, stop: timer.stop },
    mark: async (kind, session, at) => { await saveSessionLabel(await getLocalDb(), { id: randomHex(16), session, at, kind, note: "from the watch" }); },
  };
};

const sendJson = (path: string, body: unknown) => { if (Wear) void Wear.sendRemote(path, JSON.stringify(body)).catch(() => {}); };

/** Builds the state from the stores and sends it. Safe to call at any time; sends nothing unless the watch app is open. */
export function publishNow(force = false): void {
  const s = useRemote.getState();
  if (!Wear || (!force && !watchIsOpen(s.openAt, Date.now()))) return;
  const t = useClimbTimer.getState();
  // A training session in front takes the screen from a climb.
  sendJson(REMOTE_PATHS.state, buildRemoteState({ now: Date.now(), climb: s.climb, timerEnd: s.climb ? t.end : null, timerLen: t.length, runner: s.runner, board: s.board }));
  if (s.summary) sendJson(REMOTE_PATHS.summary, buildSummary(s.summary));
}

/**
 * Handles what the native inbox holds that is a remote command. Returns the rest, for the recorder's own handling. Commands are acted
 * on the moment they are read; each is dropped if it waited too long (a swipe from a minute ago must not move the climb now).
 */
export async function handleRemoteLines(lines: string[]): Promise<string[]> {
  const { commands, rest } = splitInbox(lines);
  for (const { parsed, receivedAt } of commands) {
    if (!parsed.ok) {
      if (parsed.id) sendJson(REMOTE_PATHS.ack, buildAck(parsed.id, false, parsed.reason === "version" ? "Update Slackboard on the phone or the watch" : "That didn't work"));
      continue;
    }
    const c = parsed.command;
    if (c.cmd === "hello") { useRemote.setState({ openAt: Date.now() }); publishNow(true); continue; }
    if (c.cmd === "bye") { useRemote.setState({ openAt: null }); continue; }
    // Any command also shows the watch is there.
    if (c.cmd !== "mark") useRemote.setState({ openAt: Date.now() });
    if (isStale(c, receivedAt, Date.now())) continue;
    const answer = await dispatch(c, controls());
    if (answer && parsed.id) sendJson(REMOTE_PATHS.ack, buildAck(parsed.id, answer.ok, answer.text));
    // The command may have changed nothing the screens notice (a refused one); the watch still needs to see the real state.
    if (answer && !answer.ok) publishNow();
  }
  return rest;
}

/** Keeps the watch's picture current: sends whenever what is shown changes, but not more than a few times a second. Mounted once. */
export function useRemotePublisher(): void {
  useSummaryForWatch();
  useEffect(() => {
    if (!Wear) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => { clearTimeout(timer); timer = setTimeout(() => publishNow(), 120); };
    const a = useRemote.subscribe(soon);
    const b = useClimbTimer.subscribe(soon);
    return () => { a(); b(); clearTimeout(timer); };
  }, []);
}

/** Today's figures for the watch's tile and complication, kept in the store so the next send carries them. */
function useSummaryForWatch(): void {
  const info = useTodayInfo();
  const plan = useCurrentPlan();
  const activities = useActivities();
  const today = useToday();
  const planned = plan ? todaysSession(plan, today) : null;
  const week = activities.filter((a) => a.day >= weekStartDay(today) && a.facts.send).length;
  useEffect(() => {
    const next = { streak: info.streak.current, streakState: info.streak.state, today: planned?.title ?? null, week };
    const cur = useRemote.getState().summary;
    if (!cur || cur.streak !== next.streak || cur.streakState !== next.streakState || cur.today !== next.today || cur.week !== next.week) useRemote.getState().setSummary(next);
  }, [info.streak.current, info.streak.state, planned?.title, week]);
}

import type { BoardScale } from "../core/boardScale";
import { loadBoardScales } from "../core/boardScaleLocal";
import type { HoldTag } from "../core/holdSurvey";
import { loadHoldTags } from "../core/holdTagsLocal";
import { exportWatchSessions, type WatchBackupSession } from "../core/watchLocal";
import { getLocalDb } from "../data/sqlite";
import { useStore } from "./store";

/**
 * The parts of a backup that live only in the local database and have no store of their own: hold tags, board scales, and, when the
 * developer menu's switch is on, the watch's recorded sessions. Both the Export screen and the automatic backup use it, so they cannot
 * disagree about what a backup holds.
 */
export async function localBackupExtras(): Promise<{ holdTags: HoldTag[]; boardScales: BoardScale[]; watch: WatchBackupSession[] }> {
  const db = await getLocalDb();
  return {
    holdTags: await loadHoldTags(db),
    boardScales: await loadBoardScales(db),
    watch: useStore.getState().settings.watchBackup ? await exportWatchSessions(db) : [],
  };
}

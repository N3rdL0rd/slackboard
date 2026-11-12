/** Dot colours that tell your boards apart at a glance, separate from the hold-role colours. */
export const BOARD_COLORS = ["#F2B84B", "#7FD1AE", "#E08BD0", "#8DB6FF", "#F28C6B", "#B8D96A"];

/** The same board always gets the same colour. */
export function boardColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return BOARD_COLORS[h % BOARD_COLORS.length];
}

/** Most recently opened first; boards never opened keep their original order after those. */
export function orderBoards<T extends { id: string }>(boards: T[], used: Record<string, number>): T[] {
  return boards.map((b, i) => ({ b, i })).sort((x, y) => (used[y.b.id] ?? 0) - (used[x.b.id] ?? 0) || x.i - y.i).map((x) => x.b);
}

/** The board after (dir 1) or before (dir -1) the current one in your list, wrapping round. */
export function neighbourBoard<T extends { id: string }>(boards: T[], currentId: string | undefined, dir: 1 | -1): T | undefined {
  if (boards.length < 2) return undefined;
  const i = boards.findIndex((b) => b.id === currentId);
  return boards[(Math.max(0, i) + dir + boards.length) % boards.length];
}

/**
 * The board the app is showing: the one chosen, else the first. `useBoard` falls back to the first board when nothing has been
 * chosen, so anything that saves a per-board choice (angle, filters) needs this id recorded, or its write has nowhere to go.
 */
export function resolveBoardId<T extends { id: string }>(boardId: string | null | undefined, boards: T[]): string | null {
  return boards.find((b) => b.id === boardId)?.id ?? boards[0]?.id ?? null;
}

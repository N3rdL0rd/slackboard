import { doneKey } from "../core/mergedLog";
import { useDeferredValue, useMemo } from "react";
import type { Climb } from "../core/types";
import { applyFilter, type DoneState, type FilterContext } from "../core/filters";
import { grades } from "../data/grades";
import { statsKeyOf, useData } from "./data";
import { useDrafts } from "./useActive";
import { useBoard, useFilter, useStore } from "./store";

type Query = { [k: string]: unknown };
// The Climb tab and the open climb both ask for this list; the second one reuses the first's result when the inputs are the same objects.
let lastQuery: Query | null = null;
let lastList: Climb[] = [];

const NONE = new Map<string, never>();

export function useClimbList() {
  const board = useBoard();
  const filter = useFilter();
  const climbs = useData((d) => d.boardData?.climbs);
  const stats = useData((d) => d.stats);
  const statsKey = useData((d) => d.statsKey);
  const done = useData((d) => d.done);
  const liked = useData((d) => d.liked);
  const betaSet = useData((d) => d.boardData?.betaSet);
  const circuits = useData((d) => d.circuits);
  const blocked = useData((d) => d.blocked);
  const drafts = useDrafts();
  const seed = useStore((s) => s.randomSeed);
  const angle = board?.angle ?? 0;
  const provider = board?.spec.provider ?? "";
  const ready = !!board && !!climbs && !!stats && statsKey === statsKeyOf(board.spec.provider, board.spec.layoutId, angle);

  // The list is recomputed from a deferred copy of the inputs, so taps (chips, segments, angle)
  // repaint immediately and the heavy filter/sort runs afterwards without blocking input.
  const query = useDeferredValue({ climbs, drafts, provider, stats, filter, liked, blocked, seed, done, angle, ready, betaSet, circuits, edges: board?.spec.edges });
  const list = useMemo(() => {
    if (!query.ready || !query.climbs || !query.stats) return [];
    if (lastQuery && Object.keys(query).every((k) => Object.is((query as Query)[k], lastQuery![k]))) return lastList;
    // Your drafts that fit this board join the list (the synced climbs already exclude them).
    const e = query.edges;
    const mine = e ? query.drafts.filter((d) => d.layoutId === board?.spec.layoutId && d.left > e.left && d.right < e.right && d.bottom > e.bottom && d.top < e.top) : [];
    const draftIds = new Set(mine.map((d) => d.uuid));
    const ctx: FilterContext = {
      stats: query.stats, grades, seed: query.seed,
      done: (u): DoneState => query.done.get(doneKey(provider, u, query.angle)),
      liked: (u) => query.liked.has(u),
      blocked: (u) => query.blocked.has(u),
      isDraft: (u) => draftIds.has(u),
      hasBeta: (u) => query.betaSet?.has(u) ?? false,
      circuits: new Map(query.circuits.map((c) => [c.uuid, new Set(c.climbs)])),
      board: query.edges ?? { left: 0, right: 0, bottom: 0, top: 0 },
    };
    const out = applyFilter(mine.length ? [...query.climbs, ...mine] : query.climbs, query.filter, ctx);
    lastQuery = query;
    lastList = out;
    return out;
  }, [query]);
  // True while the list on screen still reflects older inputs (the deferred recompute has not landed yet).
  const pending = query.filter !== filter || query.climbs !== climbs || query.stats !== stats || query.angle !== angle || query.seed !== seed || query.done !== done || query.liked !== liked || query.blocked !== blocked;
  return { list, stats: query.stats ?? NONE, done, angle: query.angle, loading: !ready || !query.ready, pending };
}

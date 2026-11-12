import { useEffect, useMemo, useState } from "react";
import { doneKey } from "../core/mergedLog";
import * as repo from "../core/repo";
import type { BoardCandidates } from "../core/suggest";
import type { Board, Placement, Role } from "../core/types";
import { getDb } from "../data/sqlite";
import { getProvider } from "../providers";
import { useData } from "./data";
import { useStore } from "./store";

export interface BoardGeometry {
  board: Board;
  placements: Placement[];
  roles: Role[];
}

interface Loaded extends BoardGeometry {
  climbs: repo.BoardData["climbs"];
  stats: Awaited<ReturnType<typeof repo.loadStatsAt>>;
  angle: number;
}

const cache = new Map<string, Promise<Loaded>>();
// A board's climbs are the big part and do not depend on the angle, so they are loaded once and shared by every angle's stats.
const dataCache = new Map<string, Promise<repo.BoardData>>();
const statsCache = new Map<string, Promise<Loaded["stats"]>>();

/** Loads a board's climbs and stats at one angle. Kept for the session, since a board's data is large and rarely changes. */
function load(board: Board, angle: number, version: number): Promise<Loaded> {
  const key = `${board.id}:${angle}:${version}:${board.spec.hsm}`;
  if (!cache.has(key)) {
    const dataKey = `${board.id}:${version}:${board.spec.hsm}`;
    const statsKey = `${board.spec.provider}:${board.spec.layoutId}:${angle}:${version}`;
    cache.set(key, (async () => {
      const db = await getDb(board.spec.provider);
      if (!dataCache.has(dataKey)) dataCache.set(dataKey, repo.loadBoardData(db, board.spec));
      if (!statsCache.has(statsKey)) statsCache.set(statsKey, repo.loadStatsAt(db, board.spec.layoutId, angle));
      const [data, stats] = await Promise.all([dataCache.get(dataKey)!, statsCache.get(statsKey)!]);
      return { board, placements: data.placements, roles: data.roles, climbs: data.climbs, stats, angle };
    })());
  }
  return cache.get(key)!;
}

/**
 * Every board of the user, with its climbs and stats at the angle the user views it at, ready for suggestions across boards.
 * `ready` is false until all boards have loaded. `version` changes when a sync has brought new climbs. `overrides` names a different
 * angle for some boards (board id to angle), used instead of the angle the user views them at.
 */
const NO_OVERRIDES: Record<string, number> = {};

export function useBoardCandidates(version = 0, overrides: Record<string, number> = NO_OVERRIDES) {
  const boards = useData((d) => d.boards);
  const done = useData((d) => d.done);
  const liked = useData((d) => d.liked);
  const blocked = useData((d) => d.blocked);
  const angles = useStore((s) => s.angles);
  const [loaded, setLoaded] = useState<Loaded[] | null>(null);
  const angleFor = (b: Board) => overrides[b.id] ?? angles[b.id] ?? b.angle;
  const wanted = boards.map((b) => `${b.id}:${angleFor(b)}`).join(",");

  useEffect(() => {
    let live = true;
    setLoaded(null);
    void Promise.all(boards.map((b) => load(b, angleFor(b), version))).then((l) => { if (live) setLoaded(l); });
    return () => { live = false; };
  }, [wanted, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const candidates = useMemo<BoardCandidates[]>(() => (loaded ?? []).map((l) => {
    const p = getProvider(l.board.spec.provider);
    return {
      key: l.board.id, name: l.board.name, provider: l.board.spec.provider, climbs: l.climbs, stats: l.stats,
      done: (u) => done.get(doneKey(l.board.spec.provider, u, l.angle)), blocked: (u) => blocked.has(u), liked: (u) => liked.has(u), gradeOf: p.commonGrade, angle: l.angle, community: p.kind === "remote",
    };
  }), [loaded, done, liked, blocked]);
  const geometry = useMemo(() => new Map((loaded ?? []).map((l) => [l.board.id, l as BoardGeometry & { angle: number }])), [loaded]);
  return { candidates, geometry, ready: loaded != null };
}

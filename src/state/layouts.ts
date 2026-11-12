import { useActiveProviderId } from "./useActive";
import { useEffect, useMemo, useState } from "react";
import * as repo from "../core/repo";
import type { BoardSpec, Climb, Placement, Role, StatsAt } from "../core/types";
import { getDb } from "../data/sqlite";
import { useData } from "./data";
import type { ClimbRef } from "../core/provider";
import { useBoard, useStore } from "./store";

// Layout ids repeat between providers, so the cache is keyed by both.
const cache = new Map<string, Promise<repo.LayoutView | null>>();
const layoutView = (provider: string, id: number) => {
  const key = `${provider}:${id}`;
  if (!cache.has(key)) cache.set(key, getDb(provider).then((db) => repo.loadLayoutView(db, id, provider)));
  return cache.get(key)!;
};

/** How to draw climbs of a layout. `undefined` while loading, `null` if the layout isn't on this device. */
export function useLayoutView(layoutId: number | undefined, providerArg?: string): repo.LayoutView | null | undefined {
  const active = useActiveProviderId();
  const provider = providerArg ?? active;
  const [view, setView] = useState<repo.LayoutView | null | undefined>(undefined);
  useEffect(() => {
    if (layoutId == null) { setView(undefined); return; }
    let live = true;
    void layoutView(provider, layoutId).then((v) => { if (live) setView(v); });
    return () => { live = false; };
  }, [layoutId, provider]);
  return view;
}

export interface Geometry {
  spec: BoardSpec;
  placements: Placement[];
  roles: Role[];
}

/**
 * Holes, roles and board shape to draw a climb with. A climb on the open board uses that board's own size and
 * hold sets; any other climb (from a circuit, search or workout, possibly on another layout) uses its layout's
 * full view. Without this, a climb from another layout draws as an empty board.
 */
export function useGeometry(climb: Pick<Climb, "uuid" | "layoutId"> | null | undefined, provider?: string): Geometry | undefined {
  const board = useBoard();
  const data = useData((d) => d.boardData);
  // A climb from another provider is never on the open board, even if its id were to match.
  const sameProvider = !provider || !board || board.spec.provider === provider;
  const onBoard = !!climb && !!board && !!data && sameProvider && data.climbIds.has(climb.uuid);
  const other = useLayoutView(climb && !onBoard ? climb.layoutId : undefined, provider);
  return useMemo(() => {
    if (!climb) return undefined;
    if (onBoard && board && data) return { spec: board.spec, placements: data.placements, roles: data.roles };
    return other ?? undefined;
  }, [climb?.uuid, onBoard, board?.spec, data, other]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Stats at one angle for a list of climbs (a circuit, a workout), whatever layout they are on. */
export function useStatsFor(uuids: string[], angle: number): StatsAt {
  const key = uuids.join(",");
  const [stats, setStats] = useState<StatsAt>(new Map());
  useEffect(() => {
    let live = true;
    void getDb().then((db) => repo.statsFor(db, uuids, angle)).then((s) => { if (live) setStats(s); });
    return () => { live = false; };
  }, [key, angle]); // eslint-disable-line react-hooks/exhaustive-deps
  return stats;
}

const refKeyOf = (r: ClimbRef) => `${r.provider}:${r.id}`;
const grouped = (refs: ClimbRef[]) => { const m = new Map<string, string[]>(); for (const r of refs) (m.get(r.provider) ?? m.set(r.provider, []).get(r.provider)!).push(r.id); return m; };

/** Climbs of a list that may span providers, found in each provider's own database. Keyed `provider:ID`. */
export function useClimbsForRefs(refs: ClimbRef[]): Map<string, Climb> {
  const key = refs.map(refKeyOf).join(",");
  const [out, setOut] = useState<Map<string, Climb>>(new Map());
  useEffect(() => {
    let live = true;
    void (async () => {
      const m = new Map<string, Climb>();
      for (const [provider, ids] of grouped(refs)) {
        for (const c of await repo.climbsByUuids(await getDb(provider), ids)) m.set(`${provider}:${c.uuid}`, c);
      }
      if (live) setOut(m);
    })();
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return out;
}

/** Stats for a list that may span providers, each at that provider's viewed angle. Keyed `provider:ID`. */
export function useStatsForRefs(refs: ClimbRef[], angleOf: (provider: string) => number): StatsAt {
  const key = refs.map(refKeyOf).join(",") + "|" + [...grouped(refs).keys()].map((p) => `${p}@${angleOf(p)}`).join(",");
  const [out, setOut] = useState<StatsAt>(new Map());
  useEffect(() => {
    let live = true;
    void (async () => {
      const m: StatsAt = new Map();
      for (const [provider, ids] of grouped(refs)) {
        for (const [u, s] of await repo.statsFor(await getDb(provider), ids, angleOf(provider))) m.set(`${provider}:${u}`, s);
      }
      if (live) setOut(m);
    })();
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return out;
}

/** The angle the user views each provider's boards at: the open board's, else the first board of that provider. */
export function useAngleOf(): (provider: string) => number {
  const boards = useData((d) => d.boards);
  const open = useBoard();
  const angles = useStore((s) => s.angles);
  return (provider) => {
    if (open && open.spec.provider === provider) return open.angle;
    const b = boards.find((x) => x.spec.provider === provider);
    return b ? angles[b.id] ?? b.angle : 40;
  };
}

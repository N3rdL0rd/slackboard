import type { Db } from "./db";
import { makeRef, refKey, type ClimbRef, type ProviderId } from "./provider";
import { localTables, migrateLocal } from "./localMigrations";

/**
 * A circuit as the user sees it: one named, coloured list of climbs that may hold climbs from several providers. It lives
 * on the device. Each provider that can hold circuits may keep a "projection" of it, a real circuit on that service with only
 * that provider's climbs, so the service's own social features (public or private, followers, share links) work on it.
 * Climbs from other providers stay local and are simply absent from a projection.
 */
export interface Projection {
  provider: ProviderId;
  /** The circuit's uuid on that provider's server. */
  remoteUuid: string;
  isPublic: boolean;
  /** Fingerprint of the fields last seen on the server, to notice changes made elsewhere. */
  remoteHash: string;
  /** The provider's climb ids as last seen on the server, in its order. */
  remoteItems: string[];
}

export interface LogicalCircuit {
  /** Local id. Circuits imported from a provider keep that provider's uuid, so links and saved filters stay valid. */
  uuid: string;
  name: string;
  description: string;
  color: string;
  /** Owner on the signed-in account(s); kept for screens that show "yours". */
  userId: number;
  /** True when any projection is public. */
  isPublic: boolean;
  items: ClimbRef[];
  /** Climb ids of `items`, for code that only deals with ids. */
  climbs: string[];
  projections: Projection[];
  createdAt: string;
  updatedAt: string;
}

/** A circuit as a provider's server reports it. */
export interface RemoteCircuit {
  uuid: string;
  name: string;
  description: string;
  color: string;
  isPublic: boolean;
  /** Climb ids in order. */
  climbs: string[];
  createdAt?: string;
  updatedAt?: string;
}

export const remoteHash = (c: Pick<RemoteCircuit, "name" | "description" | "color" | "isPublic">): string => JSON.stringify([c.name, c.description, c.color, c.isPublic]);

export const idsOf = (items: ClimbRef[], provider: ProviderId): string[] => items.filter((i) => i.provider === provider).map((i) => i.id);

function withDerived(c: Omit<LogicalCircuit, "isPublic" | "climbs">): LogicalCircuit {
  return { ...c, isPublic: c.projections.some((p) => p.isPublic), climbs: c.items.map((i) => i.id) };
}

/**
 * Applies what changed on a provider's server to the climbs we hold. Removed there: removed here. Added there: inserted after
 * the climb that precedes it on the server (or first), so it lands near where it was put. Reordered there: that provider's
 * climbs take the server's order, in the slots they already occupy, so other providers' climbs keep their places.
 */
export function mergeRemoteItems(items: ClimbRef[], provider: ProviderId, previous: string[], next: string[]): ClimbRef[] {
  const nextSet = new Set(next);
  const prevSet = new Set(previous);
  let out = items.filter((i) => i.provider !== provider || nextSet.has(i.id) || !prevSet.has(i.id));
  // A provider climb we hold that was never on the server (just added here, not yet pushed) is kept; one the server dropped is gone.
  const have = new Set(out.filter((i) => i.provider === provider).map((i) => i.id));
  for (let k = 0; k < next.length; k++) {
    const id = next[k];
    if (have.has(id)) continue;
    const anchor = k > 0 ? out.findIndex((i) => i.provider === provider && i.id === next[k - 1]) : -1;
    out = [...out.slice(0, anchor + 1), makeRef(provider, id), ...out.slice(anchor + 1)];
    have.add(id);
  }
  // Order: put this provider's climbs in the server's order within their own slots.
  const slots = out.map((i, idx) => (i.provider === provider ? idx : -1)).filter((idx) => idx >= 0);
  const ordered = out.filter((i) => i.provider === provider).sort((a, b) => {
    const ia = next.indexOf(a.id), ib = next.indexOf(b.id);
    return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib);
  });
  const result = [...out];
  slots.forEach((slot, n) => { result[slot] = ordered[n]; });
  return result;
}

/**
 * Brings the local circuits in line with one provider's server circuits. Unseen server circuits are imported (keeping the
 * server's uuid as the local id); changed ones update the local copy (the server wins on name, colour, description and
 * visibility); ones gone from the server lose that projection but stay on the device. `complete` must be false while the
 * server data may be partial (a first sync still running), so a missing circuit is not mistaken for a deleted one.
 */
export function reconcile(local: LogicalCircuit[], provider: ProviderId, remotes: RemoteCircuit[], opts: { userId: number; now: string; complete: boolean }): LogicalCircuit[] {
  const out: LogicalCircuit[] = local.map((c) => ({ ...c, projections: c.projections.map((p) => ({ ...p })) }));
  const remoteIds = new Set(remotes.map((r) => r.uuid));

  for (const r of remotes) {
    const at = out.findIndex((c) => c.projections.some((p) => p.provider === provider && p.remoteUuid === r.uuid));
    const hash = remoteHash(r);
    if (at < 0) {
      out.push(withDerived({
        uuid: r.uuid, name: r.name, description: r.description, color: r.color, userId: opts.userId,
        items: r.climbs.map((id) => makeRef(provider, id)),
        projections: [{ provider, remoteUuid: r.uuid, isPublic: r.isPublic, remoteHash: hash, remoteItems: r.climbs }],
        createdAt: r.createdAt ?? opts.now, updatedAt: r.updatedAt ?? opts.now,
      }));
      continue;
    }
    const c = out[at];
    const p = c.projections.find((x) => x.provider === provider && x.remoteUuid === r.uuid)!;
    let next = { ...c };
    if (p.remoteHash !== hash) {
      next = { ...next, name: r.name, description: r.description, color: r.color, updatedAt: r.updatedAt ?? opts.now };
      p.remoteHash = hash;
      p.isPublic = r.isPublic;
    }
    if (JSON.stringify(p.remoteItems) !== JSON.stringify(r.climbs)) {
      next = { ...next, items: mergeRemoteItems(c.items, provider, p.remoteItems, r.climbs) };
      p.remoteItems = r.climbs;
    }
    out[at] = withDerived({ ...next, projections: c.projections });
  }

  if (!opts.complete) return out.map((c) => withDerived(c));
  return out.map((c) => {
    const kept = c.projections.filter((p) => p.provider !== provider || remoteIds.has(p.remoteUuid));
    return kept.length === c.projections.length ? withDerived(c) : withDerived({ ...c, projections: kept });
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Storage

/** Brings the phone's own database up to date (see localMigrations.ts). */
export async function ensureLocalSchema(db: Db): Promise<void> {
  await migrateLocal(db);
}

export async function loadLogicalCircuits(db: Db): Promise<LogicalCircuit[]> {
  const rows = await db.all<{ uuid: string; name: string; description: string; color: string; user_id: number; created_at: string; updated_at: string }>(
    "SELECT uuid, name, description, color, user_id, created_at, updated_at FROM l_circuits ORDER BY created_at, uuid");
  const items = await db.all<{ c: string; provider: string; id: string }>("SELECT circuit_uuid AS c, provider, climb_id AS id FROM l_circuit_items ORDER BY circuit_uuid, position");
  const projs = await db.all<{ c: string; provider: string; remote_uuid: string; is_public: number; remote_hash: string; remote_items: string }>(
    "SELECT circuit_uuid AS c, provider, remote_uuid, is_public, remote_hash, remote_items FROM l_projections");
  const itemsBy = new Map<string, ClimbRef[]>();
  for (const i of items) (itemsBy.get(i.c) ?? itemsBy.set(i.c, []).get(i.c)!).push({ provider: i.provider, id: i.id });
  const projBy = new Map<string, Projection[]>();
  for (const p of projs) (projBy.get(p.c) ?? projBy.set(p.c, []).get(p.c)!).push({ provider: p.provider, remoteUuid: p.remote_uuid, isPublic: !!p.is_public, remoteHash: p.remote_hash, remoteItems: JSON.parse(p.remote_items) });
  return rows.map((r) => withDerived({
    uuid: r.uuid, name: r.name, description: r.description, color: r.color, userId: r.user_id, createdAt: r.created_at, updatedAt: r.updated_at,
    items: itemsBy.get(r.uuid) ?? [], projections: projBy.get(r.uuid) ?? [],
  }));
}

/** Writes the circuits that differ from what is stored, and deletes stored ones that are gone. */
export async function saveLogicalCircuits(db: Db, circuits: LogicalCircuit[], before: LogicalCircuit[]): Promise<void> {
  const prev = new Map(before.map((c) => [c.uuid, JSON.stringify(c)]));
  const keep = new Set(circuits.map((c) => c.uuid));
  await db.transaction(async () => {
    for (const old of before) {
      if (keep.has(old.uuid)) continue;
      await db.run("DELETE FROM l_circuits WHERE uuid = ?", [old.uuid]);
      await db.run("DELETE FROM l_circuit_items WHERE circuit_uuid = ?", [old.uuid]);
      await db.run("DELETE FROM l_projections WHERE circuit_uuid = ?", [old.uuid]);
    }
    for (const c of circuits) {
      if (prev.get(c.uuid) === JSON.stringify(c)) continue;
      await db.run("INSERT OR REPLACE INTO l_circuits (uuid, name, description, color, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [c.uuid, c.name, c.description, c.color, c.userId, c.createdAt, c.updatedAt]);
      await db.run("DELETE FROM l_circuit_items WHERE circuit_uuid = ?", [c.uuid]);
      await db.run("DELETE FROM l_projections WHERE circuit_uuid = ?", [c.uuid]);
      const seen = new Set<string>();
      let pos = 0;
      for (const i of c.items) {
        if (seen.has(refKey(i))) continue; // a climb appears once per circuit
        seen.add(refKey(i));
        await db.run("INSERT INTO l_circuit_items (circuit_uuid, position, provider, climb_id) VALUES (?, ?, ?, ?)", [c.uuid, pos++, i.provider, i.id]);
      }
      for (const p of c.projections) {
        await db.run("INSERT INTO l_projections (circuit_uuid, provider, remote_uuid, is_public, remote_hash, remote_items) VALUES (?, ?, ?, ?, ?, ?)",
          [c.uuid, p.provider, p.remoteUuid, p.isPublic ? 1 : 0, p.remoteHash, JSON.stringify(p.remoteItems)]);
      }
    }
  });
}

/** Imports the provider's circuits into the local store and returns the result. Call after the provider's mirror changes. */
export async function syncLogicalCircuits(db: Db, provider: ProviderId, remotes: RemoteCircuit[], opts: { userId: number; now: string; complete: boolean }): Promise<LogicalCircuit[]> {
  const before = await loadLogicalCircuits(db);
  const after = reconcile(before, provider, remotes, opts);
  await saveLogicalCircuits(db, after, before);
  return after;
}

/** Empties the tables that hold what the user logged on this phone and what was built from it, when they remove their data. */
export async function clearLocalData(db: Db): Promise<void> {
  for (const t of localTables()) if (t.clearable) await db.exec(`DELETE FROM ${t.name}`);
}

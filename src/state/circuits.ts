import { circuitClimbsReq, circuitReq, climbCircuitsReq, deleteCircuitReq, submit, type Req, type SaveCircuitInput, type SubmitResult } from "../core/api";
import { idsOf, remoteHash, saveLogicalCircuits, type LogicalCircuit, type Projection } from "../core/logicalCircuits";
import { makeRef, refKey, type ClimbRef } from "../core/provider";
import { applySync } from "../core/sync";
import { getDb, getLocalDb } from "../data/sqlite";
import { DEFAULT_PROVIDER, getProvider } from "../providers";
import { useData } from "./data";
import { refreshUserData } from "./outbox";
import { sessionFor } from "./session";
import { useStore } from "./store";

export type CircuitResult = { ok: true; uuid: string } | { ok: false; message: string };

/** What the circuit editor produces. `publish` keeps a copy on the provider's server, where its social features apply. */
export interface CircuitInput extends SaveCircuitInput {
  publish: boolean;
}

const fail = (message: string): CircuitResult => ({ ok: false, message });
const randomId = () => Array.from({ length: 32 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("").toUpperCase();
const now = () => new Date().toISOString().slice(0, 19).replace("T", " ");

type Ok = { ok: true; body: Record<string, unknown> };
type Bad = { ok: false; message: string };

/** One request to the server. Failures become a message to show; successes are applied to the local mirror by the caller. */
async function call(provider: string, make: (s: NonNullable<ReturnType<typeof sessionFor>>) => Req): Promise<Ok | Bad> {
  const s = sessionFor(provider);
  if (!s) return { ok: false, message: "Sign in again to continue." };
  const res: SubmitResult = await submit(s, make(s));
  if (res.status === "retry") return { ok: false, message: "Couldn't reach the server. Check your connection and try again." };
  if (res.status === "rejected") return { ok: false, message: (res.errors && Object.values(res.errors).flat()[0]) || "The server didn't accept that." };
  return { ok: true, body: res.body };
}

const remoteUuidOf = (body: Record<string, unknown>): string => (body.circuits as { uuid: string }[] | undefined)?.[0]?.uuid ?? "";
const circuitsNow = (): LogicalCircuit[] => useData.getState().circuits;
const find = (uuid: string) => circuitsNow().find((c) => c.uuid === uuid);
const projectionOf = (c: LogicalCircuit, provider: string): Projection | undefined => c.projections.find((p) => p.provider === provider);

/** Writes the new local state, then re-reads everything so the screens and the server-side projections agree. */
async function commit(next: LogicalCircuit[], bodies: { provider: string; body: Record<string, unknown> }[] = []): Promise<void> {
  await saveLogicalCircuits(await getLocalDb(), next, circuitsNow());
  for (const b of bodies) await applySync(await getDb(b.provider), b.body);
  await refreshUserData();
}

const replaceOne = (list: LogicalCircuit[], next: LogicalCircuit): LogicalCircuit[] => list.map((c) => (c.uuid === next.uuid ? next : c));
const dedupe = (items: ClimbRef[]) => { const seen = new Set<string>(); return items.filter((i) => !seen.has(refKey(i)) && !!seen.add(refKey(i))); };
const touch = (c: LogicalCircuit): LogicalCircuit => ({ ...c, items: dedupe(c.items), climbs: dedupe(c.items).map((i) => i.id), updatedAt: now() });

/**
 * A new circuit. With `publish` it is created on the provider's server first, because its id is needed for what follows; the
 * server's copy then arrives like any other and is imported under the server's uuid. Without it, it exists only on the device
 * and needs no connection.
 */
export async function createCircuit(i: CircuitInput, provider = DEFAULT_PROVIDER.id): Promise<CircuitResult> {
  const userId = useStore.getState().accounts[provider]?.userId ?? 0;
  if (i.publish && getProvider(provider).capabilities.circuits) {
    const r = await call(provider, (s) => circuitReq(s, i));
    if (!r.ok) return fail(r.message);
    await commit(circuitsNow(), [{ provider, body: r.body }]);
    return { ok: true, uuid: remoteUuidOf(r.body) };
  }
  const uuid = randomId();
  const t = now();
  await commit([...circuitsNow(), { uuid, name: i.name, description: i.description, color: i.color, userId, items: [], climbs: [], projections: [], isPublic: false, createdAt: t, updatedAt: t }]);
  return { ok: true, uuid };
}

/** Name, description, colour and where the circuit is published. Turning `publish` off deletes the server's copy; the local circuit stays. */
export async function updateCircuit(uuid: string, i: CircuitInput, provider = DEFAULT_PROVIDER.id): Promise<CircuitResult> {
  const c = find(uuid);
  if (!c) return fail("That circuit isn't on this device any more.");
  const p = projectionOf(c, provider);
  const bodies: { provider: string; body: Record<string, unknown> }[] = [];
  let next: LogicalCircuit = touch({ ...c, name: i.name, description: i.description, color: i.color });
  if (i.publish && p) {
    const r = await call(provider, (s) => circuitReq(s, { ...i, uuid: p.remoteUuid }));
    if (!r.ok) return fail(r.message);
    bodies.push({ provider: provider, body: r.body });
    next = { ...next, projections: next.projections.map((x) => (x.provider === provider ? { ...x, isPublic: i.isPublic, remoteHash: remoteHash({ ...i }) } : x)) };
  } else if (i.publish && getProvider(provider).capabilities.circuits) {
    // Publishing a local circuit: create the server copy, link it before anything re-imports it, then put its climbs there.
    const made = await call(provider, (s) => circuitReq(s, { name: i.name, description: i.description, color: i.color, isPublic: i.isPublic }));
    if (!made.ok) return fail(made.message);
    bodies.push({ provider, body: made.body });
    const remoteUuid = remoteUuidOf(made.body);
    const ids = idsOf(next.items, provider);
    next = { ...next, projections: [...next.projections, { provider, remoteUuid, isPublic: i.isPublic, remoteHash: remoteHash({ ...i }), remoteItems: [] }] };
    await saveLogicalCircuits(await getLocalDb(), replaceOne(circuitsNow(), next), circuitsNow());
    if (ids.length) {
      const put = await call(provider, () => circuitClimbsReq(remoteUuid, ids));
      if (!put.ok) return fail(put.message);
      bodies.push({ provider, body: put.body });
    }
  } else if (!i.publish && p) {
    const r = await call(p.provider ?? provider, () => deleteCircuitReq(p.remoteUuid));
    if (!r.ok) return fail(r.message);
    bodies.push({ provider: provider, body: r.body });
    next = { ...next, projections: next.projections.filter((x) => x !== p) };
  }
  await commit(replaceOne(circuitsNow(), { ...next, isPublic: next.projections.some((x) => x.isPublic) }), bodies);
  return { ok: true, uuid };
}

/** Deletes the circuit here and every server copy of it. The climbs in it are not affected. */
export async function deleteCircuit(uuid: string): Promise<CircuitResult> {
  const c = find(uuid);
  if (!c) return { ok: true, uuid };
  const bodies: { provider: string; body: Record<string, unknown> }[] = [];
  for (const p of c.projections) {
    const r = await call(p.provider, () => deleteCircuitReq(p.remoteUuid));
    if (!r.ok) return fail(r.message);
    bodies.push({ provider: p.provider, body: r.body });
  }
  await commit(circuitsNow().filter((x) => x.uuid !== uuid), bodies);
  return { ok: true, uuid };
}

/** Replaces the circuit's climbs, in order. Each provider's server copy gets only that provider's climbs. */
export async function setCircuitClimbs(uuid: string, items: ClimbRef[]): Promise<CircuitResult> {
  const c = find(uuid);
  if (!c) return fail("That circuit isn't on this device any more.");
  const next = touch({ ...c, items });
  const bodies: { provider: string; body: Record<string, unknown> }[] = [];
  for (const p of c.projections) {
    const r = await call(p.provider, () => circuitClimbsReq(p.remoteUuid, idsOf(next.items, p.provider)));
    if (!r.ok) return fail(r.message);
    bodies.push({ provider: p.provider, body: r.body });
  }
  await commit(replaceOne(circuitsNow(), next), bodies);
  return { ok: true, uuid };
}

/** Sets which circuits one climb is in, across all of them. Only circuits kept on the climb's provider are sent to its server. */
export async function setClimbCircuits(ref: ClimbRef | string, circuitUuids: string[]): Promise<CircuitResult> {
  const r0 = typeof ref === "string" ? makeRef(DEFAULT_PROVIDER.id, ref) : ref;
  const want = new Set(circuitUuids);
  const bodies: { provider: string; body: Record<string, unknown> }[] = [];
  const next = circuitsNow().map((c) => {
    const has = c.items.some((i) => refKey(i) === refKey(r0));
    if (want.has(c.uuid) && !has) return touch({ ...c, items: [...c.items, r0] });
    if (!want.has(c.uuid) && has) return touch({ ...c, items: c.items.filter((i) => refKey(i) !== refKey(r0)) });
    return c;
  });
  const remoteUuids = next.filter((c) => want.has(c.uuid)).flatMap((c) => (projectionOf(c, r0.provider) ? [projectionOf(c, r0.provider)!.remoteUuid] : []));
  const changedOnServer = next.some((c, k) => c !== circuitsNow()[k] && !!projectionOf(c, r0.provider));
  if (changedOnServer) {
    const r = await call(r0.provider, () => climbCircuitsReq(r0.id, remoteUuids));
    if (!r.ok) return fail(r.message);
    bodies.push({ provider: r0.provider, body: r.body });
  }
  await commit(next, bodies);
  return { ok: true, uuid: r0.id };
}

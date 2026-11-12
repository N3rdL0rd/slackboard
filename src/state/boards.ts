import { deleteWallReq, submit, wallReq, type SaveWallInput } from "../core/api";
import * as Location from "expo-location";
import { withTimeout } from "../core/timeout";
import { applySync } from "../core/sync";
import { getDb } from "../data/sqlite";
import { refreshUserData } from "./outbox";
import { getProvider } from "../providers";
import { useData } from "./data";
import { removeMoonBoard, renameMoonBoard } from "./moonboard";
import { sessionFor } from "./session";
import { useStore } from "./store";
import { placeNewBoard } from "./spaces";

export type BoardResult = { ok: true; uuid: string } | { ok: false; message: string };

const OFFLINE = "Couldn't reach the server. Check your connection and try again.";

/** Boards are saved online only: the server derives the hold-set mask and the new id, which the app needs straight away. */
async function send(req: ReturnType<typeof wallReq>): Promise<BoardResult & { body?: Record<string, unknown> }> {
  const s = sessionFor();
  if (!s) return { ok: false, message: "Sign in again to continue." };
  const res = await submit(s, req);
  if (res.status === "retry") return { ok: false, message: OFFLINE };
  if (res.status === "rejected") return { ok: false, message: (res.errors && Object.values(res.errors).flat()[0]) || "The server didn't accept that board." };
  await applySync(await getDb(), res.body);
  await refreshUserData();
  const uuid = (res.body.walls as { uuid: string }[] | undefined)?.[0]?.uuid ?? "";
  return { ok: true, uuid, body: res.body };
}

const isLocalBoard = (uuid: string): boolean => getProvider(useData.getState().boards.find((b) => b.id === uuid)?.spec.provider).kind === "local";

/** The phone's position when location is already allowed, else null: a home board without one simply gets its own Space. */
export async function homeLocation(): Promise<{ lat: number; lon: number } | null> {
  try {
    const permission = await withTimeout(Location.getForegroundPermissionsAsync(), 2000, null);
    if (!permission?.granted) return null;
    // A fix can take forever indoors, and adding a board must not wait for it: the last known position is enough for a Space.
    const position =
      (await withTimeout(Location.getLastKnownPositionAsync(), 1500, null)) ??
      (await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), 4000, null));
    return position ? { lat: position.coords.latitude, lon: position.coords.longitude } : null;
  } catch {
    return null;
  }
}

export async function createBoard(input: SaveWallInput, place?: { gymName: string; lat: number; lon: number }): Promise<BoardResult> {
  const s = sessionFor();
  if (!s) return { ok: false, message: "Sign in again to continue." };
  const out = await send(wallReq(s, input));
  if (out.ok) {
    const location = place ? { lat: place.lat, lon: place.lon } : await homeLocation();
    await placeNewBoard(out.uuid, { gymName: place?.gymName ?? null, location });
    useStore.getState().setBoard(out.uuid);
  }
  return out.ok ? { ok: true, uuid: out.uuid } : out;
}

/** Changes a board's name, angle, size, hold sets or controller serial. */
export async function updateBoard(uuid: string, input: SaveWallInput): Promise<BoardResult> {
  // A local board has no server: only its name can change.
  if (isLocalBoard(uuid)) { await renameMoonBoard(uuid, input.name); return { ok: true, uuid }; }
  const s = sessionFor();
  if (!s) return { ok: false, message: "Sign in again to continue." };
  const out = await send(wallReq(s, { ...input, uuid }));
  return out.ok ? { ok: true, uuid: out.uuid || uuid } : out;
}

export async function removeBoard(uuid: string): Promise<BoardResult> {
  if (isLocalBoard(uuid)) { await removeMoonBoard(uuid); return { ok: true, uuid }; }
  const out = await send(deleteWallReq(uuid));
  if (out.ok) {
    const { boardId, setBoard } = useStore.getState();
    if (boardId === uuid) setBoard("");
  }
  return out.ok ? { ok: true, uuid } : out;
}

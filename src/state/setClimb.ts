import { climbReq, submit, type SaveClimbInput } from "../core/api";
import { saveOwnClimb } from "../core/moonLocal";
import { getProvider } from "../providers";
import { activeProviderId } from "./active";
import { reloadOpenBoard } from "./data";
import { applySync } from "../core/sync";
import { getDb } from "../data/sqlite";
import { useData } from "./data";
import { refreshUserData } from "./outbox";
import { sessionFor } from "./session";
import { useStore } from "./store";

export type SaveClimbResult = { ok: true; uuid: string } | { ok: false; message: string };

/** Saves a draft or publishes a climb (online only: the server validates the name and works out the board area). */
export async function saveClimb(input: SaveClimbInput & { difficulty?: number; method?: string }): Promise<SaveClimbResult> {
  const provider = activeProviderId();
  if (getProvider(provider).kind === "local") {
    // No server: the problem is written to the phone and is on the board's list straight away.
    if (input.difficulty === undefined) return { ok: false, message: "Choose a grade." };
    try {
      const uuid = await saveOwnClimb(await getDb(provider), {
        uuid: input.uuid, layoutId: input.layoutId, name: input.name, method: input.method ?? input.description, frames: input.frames,
        angle: input.angle ?? 40, difficulty: input.difficulty,
      });
      await refreshUserData();
      await reloadOpenBoard();
      return { ok: true, uuid };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Couldn't save that problem." };
    }
  }
  const s = sessionFor();
  if (!s) return { ok: false, message: "Sign in again to continue." };
  const res = await submit(s, climbReq(s, input));
  if (res.status === "retry") return { ok: false, message: "Couldn't reach the server. Check your connection and try again." };
  if (res.status === "rejected") {
    const first = res.errors && Object.values(res.errors).flat()[0];
    return { ok: false, message: first || (res.code === 401 || res.code === 403 ? "Your account can't set climbs." : "The server didn't accept that climb.") };
  }
  await applySync(await getDb(), res.body);
  await refreshUserData();
  const uuid = (res.body.climbs as { uuid: string }[] | undefined)?.[0]?.uuid ?? input.uuid ?? "";
  // A newly published climb joins the open board's list.
  const board = useStore.getState();
  const spec = useData.getState().boards.find((b) => b.id === board.boardId)?.spec;
  if (spec) await useData.getState().loadBoard(spec);
  return { ok: true, uuid };
}

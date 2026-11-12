import { submit, type Req } from "../core/api";
import { deleteOwnClimb } from "../core/moonLocal";
import { getProvider } from "../providers";
import { activeProviderId } from "./active";
import { reloadOpenBoard } from "./data";
import { applySync } from "../core/sync";
import { getDb } from "../data/sqlite";
import { refreshUserData } from "./outbox";
import { sessionFor } from "./session";
import { useStore } from "./store";

export type ActionResult = { ok: true } | { ok: false; message: string };

async function run(make: (userId: number) => Req, apply = true): Promise<ActionResult> {
  const s = sessionFor();
  if (!s) return { ok: false, message: "Sign in again to continue." };
  const res = await submit(s, make(s.userId));
  if (res.status === "retry") return { ok: false, message: "Couldn't reach the server. Check your connection and try again." };
  if (res.status === "rejected") return { ok: false, message: (res.errors && Object.values(res.errors).flat()[0]) || (res.code === 401 || res.code === 403 ? "You're not allowed to do that." : "The server didn't accept that.") };
  if (apply) await applySync(await getDb(), res.body);
  await refreshUserData();
  return { ok: true };
}

/** Tells the setters' moderators a climb has a problem (`POST /climb_reports`). */
export const reportClimb = (climbUuid: string, message: string) => run((user_id) => ({ path: "/climb_reports", fields: { user_id, climb_uuid: climbUuid, message } }), false);

/** Removes a climb you set. The server decides whether you may (permission and how many people have sent it). */
export async function deleteClimb(climbUuid: string): Promise<ActionResult> {
  const provider = activeProviderId();
  if (getProvider(provider).kind === "local") {
    // No server: the problem is removed from the phone, if it is one the user set. Their logs of it stay.
    if (!(await deleteOwnClimb(await getDb(provider), climbUuid))) return { ok: false, message: "You can only delete problems you set." };
    await refreshUserData();
    await reloadOpenBoard();
    return { ok: true };
  }
  return run(() => ({ path: "/climbs/delete", fields: { uuid: climbUuid } }));
}

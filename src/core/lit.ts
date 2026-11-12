import { type Req, type Session } from "./api";

/** The official app waits this long after a climb is lit before recording it, so flicking through climbs records only where you stop. */
export const LIT_DEBOUNCE_MS = 3000;

/**
 * The server request that records "this climb was lit on this controller" in its Recently lit history, or null when it
 * should not be sent: the user opted out, or the board has no controller serial so there is no history to add to.
 */
export function litRequest(opts: { enabled: boolean; session: Session | null; serial: string | null; climbUuid: string }): Req | null {
  if (!opts.enabled || !opts.session || !opts.serial) return null;
  return { path: "/exhibits", fields: { user_id: opts.session.userId, climb_uuid: opts.climbUuid, serial_number: opts.serial } };
}

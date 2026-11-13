import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useEffect } from "react";
import { useBle } from "./ble";

/**
 * Keeps the screen on, and so the phone awake, while the app is connected (or connecting) to a board: a phone that sleeps takes the
 * link with it, and having to reconnect mid-session is the thing to avoid. It is bounded by the idle disconnect, which lets go after
 * 20 minutes of nothing being written to the board. Mounted once, at the root.
 */
export function useBoardKeepAwake(): void {
  const phase = useBle((s) => s.phase);
  const on = phase === "connected" || phase === "connecting";
  useEffect(() => {
    if (!on) return;
    void activateKeepAwakeAsync("board");
    return () => { void deactivateKeepAwake("board"); };
  }, [on]);
}

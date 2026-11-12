import { useBle, linkMatches } from "./ble";
import { useBoard } from "./store";
import { c, role } from "../theme";

/** How the bulb buttons look: a dot that is grey when not connected, amber while connecting and green when lit climbs can reach the board. */
export function useLedStatus() {
  const phase = useBle((s) => s.phase);
  const match = useBle((s) => s.match);
  const board = useBoard();
  const connected = phase === "connected";
  const matches = connected && linkMatches(board);
  void match; // re-render when the link is opened for a different board
  const dot = matches ? role.start.color : connected ? c.starOn : phase === "connecting" ? c.starOn : c.ledOff;
  const label = matches ? "Connected to the board. Show LED status" : connected ? "Connected, but to a different board" : phase === "connecting" ? "Connecting to the board" : "Connect to the board with Bluetooth";
  return { phase, connected, matches, dot, label };
}

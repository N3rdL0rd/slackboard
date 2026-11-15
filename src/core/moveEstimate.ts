/**
 * A rough read of a climb from where its holds are: how many hand moves, how long its hand path is and its longest move. The order the
 * hands visit the holds is not recorded anywhere, so the holds are taken in order up the board; a climb that goes sideways or down
 * is read wrongly. It is a guide for comparing climbs, not a count of what any climber will do.
 */
export interface PlacedHold { x: number; y: number; /** start | middle | finish | foot */ role: string }

export interface MoveEstimate {
  handHolds: number;
  /** Hand holds after the start. */
  moves: number;
  /** In board units; multiply by the board's centimetres per unit for real lengths. */
  pathUnits: number;
  longestUnits: number;
}

export function estimateMoves(holds: PlacedHold[]): MoveEstimate | null {
  const hands = holds.filter((h) => h.role !== "foot").sort((a, b) => a.y - b.y || a.x - b.x);
  if (hands.length === 0) return null;
  const starts = hands.filter((h) => h.role === "start").length;
  let pathUnits = 0;
  let longestUnits = 0;
  for (let i = 1; i < hands.length; i++) {
    // Two start holds are one position, not a move between them.
    if (hands[i].role === "start" && hands[i - 1].role === "start") continue;
    const d = Math.hypot(hands[i].x - hands[i - 1].x, hands[i].y - hands[i - 1].y);
    pathUnits += d;
    longestUnits = Math.max(longestUnits, d);
  }
  return { handHolds: hands.length, moves: starts > 0 ? hands.length - starts : Math.max(hands.length - 1, 0), pathUnits, longestUnits };
}

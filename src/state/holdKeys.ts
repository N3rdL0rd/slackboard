import { useMemo } from "react";
import { deadPattern, deadPlacementIds, surveyBoardId, surveyOrder, type SurveyHold } from "../core/holdSurvey";
import { positionName, positionOfPlacement } from "../core/moonboard";
import type { Board } from "../core/types";
import { useData } from "./data";
import { useHoldTags } from "./holdTags";
import { MOON } from "./moonboard";

/** The key a hold is known by in the hold-type files: the cell name on a MoonBoard, the placement id on an Aurora board. */
export const holdKeyOf = (provider: string) => (placementId: number): string => (provider === MOON ? positionName(positionOfPlacement(placementId)) : String(placementId));

/** The board's id as the survey stores it, and its holds in the order the survey visits them. Empty until the board's holes have loaded. */
export function useSurveyOrder(board: Board | null): { boardId: string; order: SurveyHold[] } {
  const placements = useData((d) => d.boardData?.placements);
  const provider = board?.spec.provider ?? "";
  const boardId = board ? surveyBoardId(provider, board.spec.layoutId, board.spec.productSizeId) : "";
  const order = useMemo(() => surveyOrder(placements ?? [], holdKeyOf(provider)), [placements, provider]);
  return { boardId, order };
}

/** The placement ids of the holds marked dead on this board. A new array only when they change. */
export function useDeadPlacements(board: Board | null): number[] {
  const { boardId, order } = useSurveyOrder(board);
  const tags = useHoldTags();
  return useMemo(() => deadPlacementIds(order, tags, boardId), [order, tags, boardId]);
}

/** A test for a climb's frames that is true when it uses a dead hold on this board; null when none is dead. */
export function useDeadPattern(board: Board | null): RegExp | null {
  const ids = useDeadPlacements(board);
  return useMemo(() => deadPattern(ids), [ids]);
}

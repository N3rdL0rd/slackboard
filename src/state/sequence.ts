import { create } from "zustand";
import type { ClimbRef } from "../core/provider";

/**
 * The run of climbs a climb screen pages through when you swipe or tap next/previous: a circuit, a workout, search
 * results. When it is null the screen pages through the open board's filtered climb list. A run can mix providers, so each
 * climb's provider is kept beside its id.
 */
interface Sequence {
  ids: string[] | null;
  /** Provider of each climb in `ids`, when it is not the open board's. */
  providers: Record<string, string>;
  /** Shown on the climb screen, e.g. the circuit's name. */
  label: string | null;
  set: (ids: string[] | null, providers: Record<string, string>, label: string | null) => void;
}

export const useSequence = create<Sequence>((set) => ({ ids: null, providers: {}, label: null, set: (ids, providers, label) => set({ ids, providers: ids ? providers : {}, label: ids ? label : null }) }));

/** Items are ids (the open board's provider) or refs (any provider). */
export function setSequence(items: (string | ClimbRef)[] | null, label: string | null = null): void {
  const providers: Record<string, string> = {};
  const ids = items ? items.map((x) => { if (typeof x === "string") return x.toUpperCase(); providers[x.id.toUpperCase()] = x.provider; return x.id.toUpperCase(); }) : null;
  useSequence.getState().set(ids, providers, label);
}

import { create } from "zustand";
import { CLIMB_TIMER_STEPS } from "../core/remote";

/**
 * The climb screen's timer, kept where the watch link can read it. It belongs to the open climb screen: that screen clears it when it
 * closes. A timer that runs out is restarted by the screen (it flips the mirror or moves to the next climb), so it keeps cycling until
 * it is stopped.
 */
interface ClimbTimer {
  /** When it ends (ms since the epoch), or null when none runs. */
  end: number | null;
  /** Seconds it was last set for. */
  length: number;
  start: (seconds: number) => void;
  stop: () => void;
}

export const useClimbTimer = create<ClimbTimer>((set) => ({
  end: null,
  length: 60,
  start: (seconds) => {
    const length = CLIMB_TIMER_STEPS.includes(seconds) ? seconds : 60;
    set({ end: Date.now() + length * 1000, length });
  },
  stop: () => set({ end: null }),
}));

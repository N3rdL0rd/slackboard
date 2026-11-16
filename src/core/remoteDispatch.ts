/**
 * Applying a watch command to whatever the phone has open. The screens register what they can do (controls); this decides what a command
 * means for them and what the watch is told. Pure apart from calling the controls it is given, so every case is tested without a phone.
 */
import type { LabelKind } from "./watchData";
import type { RemoteCommand, RunnerOp } from "./remote";

export interface ClimbControls {
  /** Move to the next or previous climb of the list. False at either end. */
  go(delta: 1 | -1): boolean;
  /** Mirror the climb. False when this board has no mirror. */
  toggleMirror(): boolean;
  /** Light the shown climb on the board. False when no matching board is connected. */
  light(): Promise<boolean>;
  /** Log the shown climb. */
  log(send: boolean, tries: number): Promise<{ ok: boolean; text: string }>;
}

export interface RunnerControls { op(op: RunnerOp): void }
export interface TimerControls { start(seconds: number): void; stop(): void }

export interface Controls {
  climb: ClimbControls | null;
  runner: RunnerControls | null;
  timer: TimerControls;
  mark(kind: LabelKind, session: string, at: number): Promise<void>;
}

/** What to tell the watch. Null: nothing, the next state says it all. */
export type Answer = { ok: boolean; text: string } | null;

const NO_CLIMB: Answer = { ok: false, text: "Open a climb on the phone" };

export async function dispatch(c: RemoteCommand, controls: Controls): Promise<Answer> {
  try {
    switch (c.cmd) {
      case "hello":
      case "bye":
        return null;
      case "next":
      case "prev":
        // At the end of the list there is nothing to do and nothing to say: the watch already shows the end.
        if (!controls.climb) return NO_CLIMB;
        controls.climb.go(c.cmd === "next" ? 1 : -1);
        return null;
      case "mirror":
        if (!controls.climb) return NO_CLIMB;
        return controls.climb.toggleMirror() ? null : { ok: false, text: "This board has no mirror" };
      case "light":
        if (!controls.climb) return NO_CLIMB;
        return (await controls.climb.light()) ? { ok: true, text: "Lit on the board" } : { ok: false, text: "Board not connected" };
      case "timer-start":
        if (!controls.climb) return NO_CLIMB;
        controls.timer.start(c.length);
        return null;
      case "timer-stop":
        controls.timer.stop();
        return null;
      case "log":
        if (!controls.climb) return NO_CLIMB;
        return await controls.climb.log(c.send, c.tries);
      case "runner":
        if (!controls.runner) return { ok: false, text: "No training session is open" };
        controls.runner.op(c.op);
        return null;
      case "mark":
        await controls.mark(c.kind, c.session, c.at);
        return null;
    }
  } catch {
    return { ok: false, text: "That didn't work" };
  }
}

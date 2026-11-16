import { describe, expect, it, vi } from "vitest";
import { dispatch, type ClimbControls, type Controls } from "./remoteDispatch";

const make = (over: Partial<ClimbControls> | null = {}, runner = true) => {
  const climb: ClimbControls | null = over === null ? null : { go: vi.fn(() => true), toggleMirror: vi.fn(() => true), light: vi.fn(async () => true), log: vi.fn(async () => ({ ok: true, text: "Send logged" })), ...over };
  const controls: Controls = { climb, runner: runner ? { op: vi.fn() } : null, timer: { start: vi.fn(), stop: vi.fn() }, mark: vi.fn(async () => {}) };
  return { controls, climb };
};

describe("applying a watch command", () => {
  it("moves the climb the way a swipe does, and says nothing at the end of the list", async () => {
    const { controls, climb } = make({ go: vi.fn(() => false) });
    expect(await dispatch({ cmd: "next" }, controls)).toBeNull();
    expect(climb!.go).toHaveBeenCalledWith(1);
    await dispatch({ cmd: "prev" }, controls);
    expect(climb!.go).toHaveBeenLastCalledWith(-1);
  });
  it("tells the watch to ask for a climb when none is open, for every command that needs one", async () => {
    const { controls } = make(null);
    for (const c of [{ cmd: "next" }, { cmd: "mirror" }, { cmd: "light" }, { cmd: "timer-start", length: 60 }, { cmd: "log", send: true, tries: 1 }] as const) {
      expect(await dispatch(c, controls), c.cmd).toEqual({ ok: false, text: "Open a climb on the phone" });
    }
    expect(controls.timer.start).not.toHaveBeenCalled();
  });
  it("answers when a board has no mirror, or no board is connected", async () => {
    expect(await dispatch({ cmd: "mirror" }, make({ toggleMirror: vi.fn(() => false) }).controls)).toEqual({ ok: false, text: "This board has no mirror" });
    expect(await dispatch({ cmd: "light" }, make({ light: vi.fn(async () => false) }).controls)).toEqual({ ok: false, text: "Board not connected" });
    expect(await dispatch({ cmd: "light" }, make().controls)).toMatchObject({ ok: true });
  });
  it("starts and stops the timer, and logs with the tries it was given", async () => {
    const { controls, climb } = make();
    await dispatch({ cmd: "timer-start", length: 120 }, controls);
    expect(controls.timer.start).toHaveBeenCalledWith(120);
    await dispatch({ cmd: "timer-stop" }, controls);
    expect(controls.timer.stop).toHaveBeenCalled();
    expect(await dispatch({ cmd: "log", send: true, tries: 3 }, controls)).toEqual({ ok: true, text: "Send logged" });
    expect(climb!.log).toHaveBeenCalledWith(true, 3);
  });
  it("sends runner steps to the open session, and says when there is none", async () => {
    const a = make();
    await dispatch({ cmd: "runner", op: "done" }, a.controls);
    expect(a.controls.runner!.op).toHaveBeenCalledWith("done");
    expect(await dispatch({ cmd: "runner", op: "done" }, make({}, false).controls)).toEqual({ ok: false, text: "No training session is open" });
  });
  it("records a mark whether or not a climb is open, and turns a failure into an answer instead of throwing", async () => {
    const a = make(null);
    await dispatch({ cmd: "mark", kind: "attempt-start", session: "s", at: 9 }, a.controls);
    expect(a.controls.mark).toHaveBeenCalledWith("attempt-start", "s", 9);
    const boom = make({ log: vi.fn(async () => { throw new Error("db"); }) });
    expect(await dispatch({ cmd: "log", send: false, tries: 1 }, boom.controls)).toEqual({ ok: false, text: "That didn't work" });
  });
  it("ignores presence", async () => {
    expect(await dispatch({ cmd: "hello" }, make().controls)).toBeNull();
  });
});

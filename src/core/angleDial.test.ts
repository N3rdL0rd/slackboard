import { describe, expect, it } from "vitest";
import { angleAt, centreOf, clampRotation, dialPitch, directionOf, dragStep, nearestAngle, rotationFor, shortestArc } from "./angleDial";

/** A Tension Board 2's angles. */
const TB2 = Array.from({ length: 14 }, (_, i) => i * 5);

describe("angle dial maths", () => {
  const lo = 0, hi = 65, centre = centreOf(lo, hi), pitch = dialPitch(lo, hi);

  it("puts each angle under the pointer and reads it back, for every angle of a board", () => {
    for (const a of TB2) expect(angleAt(rotationFor(a, centre, pitch), centre, pitch)).toBeCloseTo(a, 9);
    expect(rotationFor(centre, centre, pitch)).toBeCloseTo(0, 12);
  });

  it("keeps the whole range on the wheel and the steps apart", () => {
    expect(pitch * (hi - lo)).toBeLessThanOrEqual(230 + 1e-9);
    expect(pitch * 5).toBeGreaterThan(10);
    expect(dialPitch(35, 45)).toBe(4); // a narrow range does not spread wider than 4 degrees per degree
  });

  it("snaps to the nearest offered angle, never an angle the board lacks", () => {
    expect(nearestAngle(TB2, 42)).toBe(40);
    expect(nearestAngle(TB2, 43)).toBe(45);
    expect(nearestAngle(TB2, -30)).toBe(0);
    expect(nearestAngle(TB2, 500)).toBe(65);
    expect(nearestAngle([20, 40], 29)).toBe(20);
  });

  it("clamps rotation to the lowest and highest angle", () => {
    expect(angleAt(clampRotation(10_000, lo, hi, centre, pitch), centre, pitch)).toBeCloseTo(lo);
    expect(angleAt(clampRotation(-10_000, lo, hi, centre, pitch), centre, pitch)).toBeCloseTo(hi);
    expect(clampRotation(5, lo, hi, centre, pitch)).toBe(5);
  });

  it("takes arcs the short way round", () => {
    expect(shortestArc(10)).toBe(10);
    expect(shortestArc(350)).toBe(-10);
    expect(shortestArc(-350)).toBe(10);
    expect(shortestArc(180)).toBe(-180);
    expect(shortestArc(540)).toBe(-180);
  });

  it("reads a direction from the dial's centre, 0 at the top and clockwise positive", () => {
    expect(directionOf(100, 0, 100, 100)).toBeCloseTo(0);
    expect(directionOf(200, 100, 100, 100)).toBeCloseTo(90);
    expect(directionOf(100, 200, 100, 100)).toBeCloseTo(180, 5);
    expect(directionOf(0, 100, 100, 100)).toBeCloseTo(-90);
  });

  it("follows a finger round the dial: clockwise turns the wheel clockwise, so a lower angle comes up", () => {
    const limits = { min: lo, max: hi, centre, pitch };
    let rot = rotationFor(40, centre, pitch);
    let dir = 0;
    // a quarter turn clockwise in small steps, finger crossing no seam
    for (let i = 1; i <= 9; i++) { const step = dragStep(rot, dir, i * 10, limits); rot = step.rotation; dir = step.direction; }
    expect(angleAt(rot, centre, pitch)).toBeCloseTo(40 - 90 / pitch, 6);
  });

  it("does not jump when the finger crosses the seam at the bottom of the dial", () => {
    const limits = { min: lo, max: hi, centre, pitch };
    const before = rotationFor(30, centre, pitch);
    const step = dragStep(before, 175, -175, limits); // +10 degrees of travel across +-180
    expect(step.rotation - before).toBeCloseTo(10, 9);
  });

  it("stops at the ends and does not store up turning the finger has not made", () => {
    const limits = { min: lo, max: hi, centre, pitch };
    let rot = rotationFor(hi, centre, pitch);
    const pushed = dragStep(rot, 0, 90, limits); // finger moves clockwise = towards a lower angle? it moves away from 65: allowed
    expect(pushed.clamped).toBe(false);
    const against = dragStep(rot, 90, 0, limits); // counterclockwise: wants an angle above 65
    expect(against.clamped).toBe(true);
    expect(against.rotation).toBe(rot);
    expect(against.direction).toBe(0);
    // turning back the other way straight away responds at once
    const back = dragStep(against.rotation, against.direction, 10, limits);
    expect(back.rotation).toBeCloseTo(rot + 10, 9);
    expect(back.clamped).toBe(false);
  });
});

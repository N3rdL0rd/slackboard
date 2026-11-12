import { describe, expect, it } from "vitest";
import { DEFAULT_NOTIFICATIONS, DEFAULT_SETTINGS, defaultUnits, parseSettings, withDefaults } from "./settings";

/** The settings an older build stored, before the Train tab, units, motivation, nudges and notifications existed. */
const OLD = { gradeDisplay: "v", shapes: true, highContrast: false, autoConnect: false, autoDisconnectSec: 30, logLit: false, haptics: true };

describe("settings from an older build", () => {
  it("keeps what the user chose and fills in everything new with defaults", () => {
    const s = withDefaults(OLD);
    expect(s).toMatchObject({ gradeDisplay: "v", shapes: true, autoConnect: false, autoDisconnectSec: 30, logLit: false });
    expect(s).toMatchObject({ trainTab: true, motivation: true, nudges: "standard", units: { weight: "kg", length: "m" } });
    expect(s.notifications).toEqual(DEFAULT_NOTIFICATIONS);
  });
  it("starts every notification type off, since they are opt-in", () => {
    const n = DEFAULT_SETTINGS.notifications;
    expect([n.plan, n.review, n.streak, n.rest, n.milestone]).toEqual([false, false, false, false, false]);
  });
  it("copes with nothing stored at all, or something that is not settings", () => {
    expect(withDefaults(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(withDefaults("nonsense")).toEqual(DEFAULT_SETTINGS);
    expect(withDefaults(null)).toEqual(DEFAULT_SETTINGS);
  });
  it("fills in a partly stored notifications group field by field", () => {
    const s = withDefaults({ ...OLD, notifications: { plan: true, planTime: "06:45" } });
    expect(s.notifications).toEqual({ ...DEFAULT_NOTIFICATIONS, plan: true, planTime: "06:45" });
  });
  it("uses the base it is given, such as pounds and feet for a US phone", () => {
    const base = { ...DEFAULT_SETTINGS, units: defaultUnits("US") };
    expect(withDefaults(OLD, base).units).toEqual({ weight: "lb", length: "ft" });
    expect(withDefaults({ ...OLD, units: { weight: "kg", length: "m" } }, base).units).toEqual({ weight: "kg", length: "m" });
  });
});

describe("reading settings safely", () => {
  it("drops values of the wrong type or outside their range, field by field", () => {
    const s = parseSettings({
      gradeDisplay: "roman", shapes: "yes", haptics: false, autoDisconnectSec: 99999, trainTab: false, nudges: "keen", motivation: 1,
      units: { weight: "stone", length: "m" }, notifications: { plan: true, review: "on", planTime: "25:00", reviewTime: "08:05", quietStart: "9pm" }, extra: 1,
    });
    expect(s).toEqual({ haptics: false, trainTab: false, nudges: "keen", notifications: { plan: true, reviewTime: "08:05" } });
  });
  it("only accepts units as a complete, valid pair", () => {
    expect(parseSettings({ units: { weight: "lb", length: "ft" } }).units).toEqual({ weight: "lb", length: "ft" });
    expect(parseSettings({ units: { weight: "lb" } }).units).toBeUndefined();
  });
  it("is empty for something that is not an object", () => {
    expect(parseSettings([])).toEqual({});
    expect(parseSettings("x")).toEqual({});
  });
});

describe("default units", () => {
  it("is pounds and feet in the US, Liberia and Myanmar, and kilograms and metres elsewhere", () => {
    expect(defaultUnits("US")).toEqual({ weight: "lb", length: "ft" });
    expect(defaultUnits("us")).toEqual({ weight: "lb", length: "ft" });
    expect(defaultUnits("GB")).toEqual({ weight: "kg", length: "m" });
    expect(defaultUnits(undefined)).toEqual({ weight: "kg", length: "m" });
  });
});

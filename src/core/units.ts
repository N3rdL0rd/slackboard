/**
 * Units are only for the edges of the app: everything is stored in kilograms and metres, and converted to the user's units when it is shown
 * or typed in. Converting back and forth never drifts, because the stored value is only replaced when the user actually changes it.
 */
import type { LengthUnit, WeightUnit } from "./settings";

const KG_PER_LB = 0.45359237;
const M_PER_FT = 0.3048;

export const kgToLb = (kg: number): number => kg / KG_PER_LB;
export const lbToKg = (lb: number): number => lb * KG_PER_LB;
export const mToFt = (m: number): number => m / M_PER_FT;
export const ftToM = (ft: number): number => ft * M_PER_FT;

/** A stored weight in kilograms, in the user's unit. */
export const weightIn = (kg: number, unit: WeightUnit): number => (unit === "lb" ? kgToLb(kg) : kg);

/** A typed weight in the user's unit, as kilograms to store. */
export const weightToKg = (value: number, unit: WeightUnit): number => (unit === "lb" ? lbToKg(value) : value);

export const lengthIn = (m: number, unit: LengthUnit): number => (unit === "ft" ? mToFt(m) : m);
export const lengthToM = (value: number, unit: LengthUnit): number => (unit === "ft" ? ftToM(value) : value);

/** How much one tap of a weight stepper changes it: half a kilo, or one pound. */
export const weightStep = (unit: WeightUnit): number => (unit === "lb" ? 1 : 0.5);

/** Rounds to the nearest `step`, so a converted weight reads as a number a plate or a hangboard can be set to. */
export const roundTo = (value: number, step: number): number => Math.round(value / step) * step;

const trim = (n: number): string => String(Number(n.toFixed(1)));

/** "62.5 kg", or "+18.5 kg" with `signed`. Pounds are shown to the nearest pound, kilograms to the nearest half. */
export function formatWeight(kg: number, unit: WeightUnit, opts: { signed?: boolean } = {}): string {
  const v = roundTo(weightIn(kg, unit), weightStep(unit));
  return `${opts.signed && v > 0 ? "+" : ""}${trim(v)} ${unit}`;
}

/** "45 m" or "148 ft". */
export function formatLength(m: number, unit: LengthUnit): string {
  return `${Math.round(lengthIn(m, unit))} ${unit}`;
}

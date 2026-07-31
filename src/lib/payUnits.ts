import { ShiftType } from "./types";

/**
 * Pay units use a scale of 0.125 to avoid floating point arithmetic
 * throughout the scheduling algorithm. Multiply by UNIT_VALUE to get the
 * real-world pay-unit number (e.g. 10 units => 1.25).
 */
export const UNIT_VALUE = 0.125;

const REGULAR_UNITS: Record<ShiftType, number> = {
  morning: 10, // 1.25
  afternoon: 4, // 0.5
  evening: 10, // 1.25
};

const PREMIUM_MULTIPLIER = 1.5;

/**
 * Returns the pay value for a shift, expressed in units of 0.125.
 * Regular: morning/evening = 10, afternoon = 4.
 * Premium (x1.5): morning/evening = 15, afternoon = 6.
 */
export function shiftUnit(shiftType: ShiftType, isPremium: boolean): number {
  const base = REGULAR_UNITS[shiftType];
  return isPremium ? Math.round(base * PREMIUM_MULTIPLIER) : base;
}

/** Converts raw unit count (0.125 scale) into the real displayed number. */
export function unitsToReal(units: number): number {
  return units * UNIT_VALUE;
}

/** Formats a raw unit count as a 2-decimal real-value string, e.g. "8.00". */
export function formatUnits(units: number): string {
  return unitsToReal(units).toFixed(2);
}

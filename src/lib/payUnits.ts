import {
  DEFAULT_SHIFT_DEFINITIONS,
  ShiftDefinition,
  ShiftType,
} from "./types";

/**
 * Pay units use a scale of 0.125 to avoid floating point arithmetic
 * throughout the scheduling algorithm. Multiply by UNIT_VALUE to get the
 * real-world pay-unit number (e.g. 10 units => 1.25).
 */
export const UNIT_VALUE = 0.125;

const PREMIUM_MULTIPLIER = 1.5;

/**
 * Converts the manager-facing pay value into the scheduler's internal
 * 0.125-unit scale. Config validation keeps values on this scale, so the
 * conversion is deterministic and never accumulates floating-point drift.
 */
export function payValueToUnits(payValue: number): number {
  const units = payValue / UNIT_VALUE;

  if (!Number.isFinite(units)) {
    throw new Error("Shift pay value must be a finite number.");
  }

  const rounded = Math.round(units);

  if (Math.abs(units - rounded) > 1e-9) {
    throw new Error(
      `Shift pay value ${payValue} must be a multiple of ${UNIT_VALUE}.`
    );
  }

  return rounded;
}

function resolveDefinition(
  shift: ShiftType | ShiftDefinition,
  definitions: readonly ShiftDefinition[]
): ShiftDefinition {
  if (typeof shift !== "string") {
    return shift;
  }

  const definition = definitions.find((item) => item.id === shift);

  if (!definition) {
    throw new Error(`Unknown shift type: ${shift}`);
  }

  return definition;
}

/**
 * Returns a shift's pay value in internal 0.125 units. Passing an id keeps
 * the legacy call shape working; new callers can pass the definition they
 * already loaded from the database. Premium days retain the existing x1.5
 * multiplier. Half-internal-unit results are intentional and exact.
 */
export function shiftUnit(
  shift: ShiftType | ShiftDefinition,
  isPremium: boolean,
  definitions: readonly ShiftDefinition[] = DEFAULT_SHIFT_DEFINITIONS
): number {
  const definition = resolveDefinition(shift, definitions);
  const base = payValueToUnits(definition.payValue);

  return isPremium ? base * PREMIUM_MULTIPLIER : base;
}

/** Converts raw unit count (0.125 scale) into the real displayed number. */
export function unitsToReal(units: number): number {
  return units * UNIT_VALUE;
}

/** Formats a raw unit count as a 2-decimal real-value string, e.g. "8.00". */
export function formatUnits(units: number): string {
  return unitsToReal(units).toFixed(2);
}

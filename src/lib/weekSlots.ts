import { shiftUnit } from "./payUnits";
import {
  DEFAULT_SHIFT_DEFINITIONS,
  ShiftDefinition,
  ShiftSlot,
} from "./types";

/** Builds all configured slots for a seven-day week, given which day
 * indices (0=Sunday..6=Saturday) are marked as premium days. */
export function buildWeekSlots(
  premiumDays: number[],
  definitions: readonly ShiftDefinition[] = DEFAULT_SHIFT_DEFINITIONS
): ShiftSlot[] {
  const premiumSet = new Set(premiumDays);
  const slots: ShiftSlot[] = [];
  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const isPremium = premiumSet.has(dayIndex);
    for (const definition of definitions) {
      slots.push({
        dayIndex,
        shiftType: definition.id,
        isPremium,
        unit: shiftUnit(definition, isPremium),
      });
    }
  }
  return slots;
}

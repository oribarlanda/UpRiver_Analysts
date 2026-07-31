import { shiftUnit } from "./payUnits";
import { SHIFT_TYPES, ShiftSlot } from "./types";

/** Builds the 21 shift slots (7 days x 3 shift types) for a week, given
 * which day indices (0=Sunday..6=Saturday) are marked as premium days. */
export function buildWeekSlots(premiumDays: number[]): ShiftSlot[] {
  const premiumSet = new Set(premiumDays);
  const slots: ShiftSlot[] = [];
  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const isPremium = premiumSet.has(dayIndex);
    for (const shiftType of SHIFT_TYPES) {
      slots.push({
        dayIndex,
        shiftType,
        isPremium,
        unit: shiftUnit(shiftType, isPremium),
      });
    }
  }
  return slots;
}

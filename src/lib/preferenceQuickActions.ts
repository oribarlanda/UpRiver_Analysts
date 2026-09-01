import {
  addWeeks,
  enumerateISODateRange,
  locateISODateInWeek,
} from "./dates";
import {
  Employee,
  PreferenceRow,
  PreferenceValue,
  Role,
  ShiftDefinition,
  ShiftType,
  WeekRow,
} from "./types";

export interface PreferenceQuickActionEntry {
  dayIndex: number;
  shiftType: ShiftType;
  preference: PreferenceValue;
}

type QuickActionWeek = Pick<
  WeekRow,
  "id" | "week_start" | "status" | "shift_definitions"
>;

export interface PreferenceQuickActionRepository {
  getWeekByStart(weekStart: string): Promise<QuickActionWeek | null>;
  getOrCreateWeek(weekStart: string): Promise<QuickActionWeek>;
  getPreferences(
    weekId: string,
    shiftTypes: readonly ShiftType[]
  ): Promise<PreferenceRow[]>;
  upsertPreferences(
    weekId: string,
    employee: Employee,
    entries: readonly PreferenceQuickActionEntry[]
  ): Promise<void>;
}

export class PreferenceQuickActionError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "PreferenceQuickActionError";
  }
}

export function employeeForQuickAction(role: Role): Employee {
  if (role === "admin") {
    throw new PreferenceQuickActionError(
      "רק עובדת יכולה לבצע פעולה מהירה על ההעדפות שלה.",
      403
    );
  }

  return role;
}

function preferenceKey(
  dayIndex: number,
  shiftType: ShiftType
): string {
  return `${dayIndex}-${shiftType}`;
}

function employeePreferenceMap(
  preferences: readonly PreferenceRow[],
  employee: Employee
): Map<string, PreferenceValue> {
  return new Map(
    preferences
      .filter((preference) => preference.employee === employee)
      .map((preference) => [
        preferenceKey(
          preference.day_index,
          preference.shift_type
        ),
        preference.preference,
      ])
  );
}

export function wholeDayEntries(
  shiftDefinitions: readonly ShiftDefinition[],
  dayIndex: number,
  preference: PreferenceValue
): PreferenceQuickActionEntry[] {
  return shiftDefinitions.map((shift) => ({
    dayIndex,
    shiftType: shift.id,
    preference,
  }));
}

export interface CopyPreviousWeekResult {
  sourceWeekStart: string;
  mappedShiftDefinitions: number;
  resetShiftDefinitions: number;
  updatedShifts: number;
}

export async function copyPreviousWeekPreferences(
  repository: PreferenceQuickActionRepository,
  employee: Employee,
  weekStart: string
): Promise<CopyPreviousWeekResult> {
  const currentWeek = await repository.getOrCreateWeek(weekStart);

  if (currentWeek.status !== "open") {
    throw new PreferenceQuickActionError(
      "אפשר להעתיק העדפות רק לשבוע שעדיין פתוח לעריכה.",
      409
    );
  }

  const sourceWeekStart = addWeeks(weekStart, -1);
  const previousWeek = await repository.getWeekByStart(sourceWeekStart);
  const currentShiftTypes = currentWeek.shift_definitions.map(
    (shift) => shift.id
  );
  const currentPreferences = await repository.getPreferences(
    currentWeek.id,
    currentShiftTypes
  );
  const currentMap = employeePreferenceMap(
    currentPreferences,
    employee
  );
  const previousShiftIds = new Set(
    previousWeek?.shift_definitions.map((shift) => shift.id) ?? []
  );
  const previousPreferences = previousWeek
    ? await repository.getPreferences(
        previousWeek.id,
        previousWeek.shift_definitions.map((shift) => shift.id)
      )
    : [];
  const previousMap = employeePreferenceMap(
    previousPreferences,
    employee
  );
  const entries: PreferenceQuickActionEntry[] = [];

  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    for (const shift of currentWeek.shift_definitions) {
      const key = preferenceKey(dayIndex, shift.id);
      const nextPreference = previousShiftIds.has(shift.id)
        ? previousMap.get(key) ?? "can"
        : "can";
      const currentPreference = currentMap.get(key) ?? "can";

      if (nextPreference !== currentPreference) {
        entries.push({
          dayIndex,
          shiftType: shift.id,
          preference: nextPreference,
        });
      }
    }
  }

  await repository.upsertPreferences(
    currentWeek.id,
    employee,
    entries
  );

  const mappedShiftDefinitions = currentWeek.shift_definitions.filter(
    (shift) => previousShiftIds.has(shift.id)
  ).length;

  return {
    sourceWeekStart,
    mappedShiftDefinitions,
    resetShiftDefinitions:
      currentWeek.shift_definitions.length - mappedShiftDefinitions,
    updatedShifts: entries.length,
  };
}

export interface UnavailabilityRangeResult {
  updatedDates: number;
  updatedShifts: number;
  updatedWeeks: string[];
  skippedDates: number;
  skippedWeeks: Array<{
    weekStart: string;
    status: WeekRow["status"];
  }>;
}

export async function setUnavailableDateRange(
  repository: PreferenceQuickActionRepository,
  employee: Employee,
  fromDate: string,
  toDate: string
): Promise<UnavailabilityRangeResult> {
  const rangeLength =
    Math.floor(
      (Date.parse(`${toDate}T00:00:00.000Z`) -
        Date.parse(`${fromDate}T00:00:00.000Z`)) /
        86_400_000
    ) + 1;

  if (rangeLength > 366) {
    throw new PreferenceQuickActionError(
      "ניתן לסמן עד שנה אחת בכל פעולה.",
      400
    );
  }

  const dates = enumerateISODateRange(fromDate, toDate);

  const datesByWeek = new Map<
    string,
    Array<{ date: string; dayIndex: number }>
  >();

  for (const date of dates) {
    const location = locateISODateInWeek(date);
    const weekDates = datesByWeek.get(location.weekStart) ?? [];

    weekDates.push({ date, dayIndex: location.dayIndex });
    datesByWeek.set(location.weekStart, weekDates);
  }

  const result: UnavailabilityRangeResult = {
    updatedDates: 0,
    updatedShifts: 0,
    updatedWeeks: [],
    skippedDates: 0,
    skippedWeeks: [],
  };

  for (const [weekStart, weekDates] of datesByWeek) {
    const week = await repository.getOrCreateWeek(weekStart);

    if (week.status !== "open") {
      result.skippedDates += weekDates.length;
      result.skippedWeeks.push({
        weekStart,
        status: week.status,
      });
      continue;
    }

    const shiftTypes = week.shift_definitions.map((shift) => shift.id);
    const preferences = await repository.getPreferences(
      week.id,
      shiftTypes
    );
    const currentMap = employeePreferenceMap(preferences, employee);
    const entries = weekDates.flatMap(({ dayIndex }) =>
      wholeDayEntries(
        week.shift_definitions,
        dayIndex,
        "cannot"
      ).filter(
        (entry) =>
          (currentMap.get(
            preferenceKey(entry.dayIndex, entry.shiftType)
          ) ?? "can") !== "cannot"
      )
    );

    await repository.upsertPreferences(week.id, employee, entries);

    result.updatedDates += weekDates.length;
    result.updatedShifts += entries.length;
    result.updatedWeeks.push(weekStart);
  }

  return result;
}

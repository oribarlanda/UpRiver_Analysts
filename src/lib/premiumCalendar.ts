import { calendar } from "@hebcal/core";
import { dayInWeek } from "./dates";

export type PremiumCalendarKind =
  | "holiday"
  | "national";

export interface PremiumDaySuggestion {
  dayIndex: number;
  date: string;
  name: string;
  kind: PremiumCalendarKind;
}

interface PremiumEventDetails {
  name: string;
  kind: PremiumCalendarKind;
}

function formatGregorianDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate
    .split("-")
    .map(Number);

  const date = new Date(
    Date.UTC(year, month - 1, day)
  );

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

function getPremiumEventDetails(
  description: string
): PremiumEventDetails | null {
  switch (description) {
    case "Erev Rosh Hashana":
      return {
        name: "ערב ראש השנה",
        kind: "holiday",
      };

    case "Rosh Hashana II":
      return {
        name: "ראש השנה ב׳",
        kind: "holiday",
      };

    case "Erev Yom Kippur":
      return {
        name: "ערב יום כיפור",
        kind: "holiday",
      };

    case "Yom Kippur":
      return {
        name: "יום כיפור",
        kind: "holiday",
      };

    case "Erev Sukkot":
      return {
        name: "ערב סוכות",
        kind: "holiday",
      };

    case "Sukkot I":
      return {
        name: "סוכות",
        kind: "holiday",
      };

    case "Shmini Atzeret":
      return {
        name: "שמיני עצרת / שמחת תורה",
        kind: "holiday",
      };

    case "Erev Pesach":
      return {
        name: "ערב פסח",
        kind: "holiday",
      };

    case "Pesach I":
      return {
        name: "פסח",
        kind: "holiday",
      };

    case "Pesach VII":
      return {
        name: "שביעי של פסח",
        kind: "holiday",
      };

    case "Erev Shavuot":
      return {
        name: "ערב שבועות",
        kind: "holiday",
      };

    case "Shavuot":
      return {
        name: "שבועות",
        kind: "holiday",
      };

    case "Yom HaZikaron":
      return {
        name: "יום הזיכרון",
        kind: "national",
      };

    case "Yom HaAtzma'ut":
      return {
        name: "יום העצמאות",
        kind: "national",
      };

    default:
      if (/^Rosh Hashana \d+$/.test(description)) {
        return {
          name: "ראש השנה א׳",
          kind: "holiday",
        };
      }

      return null;
  }
}

/**
 * Returns calendar-based suggestions only. Nothing is persisted or marked as
 * premium until the manager explicitly accepts a suggestion.
 */
export function getPremiumDaySuggestions(
  weekStart: string
): PremiumDaySuggestion[] {
  const weekDates = Array.from(
    { length: 7 },
    (_, dayIndex) => dayInWeek(weekStart, dayIndex)
  );

  const weekDateSet = new Set(weekDates);
  const dayIndexByDate = new Map(
    weekDates.map((date, dayIndex) => [date, dayIndex])
  );

  /*
   * Generate each Gregorian year touched by the week, plus the following day.
   * The extra day lets us derive an Erev that falls on Saturday when the
   * holiday itself begins the next Sunday.
   */
  const years = new Set(
    [...weekDates, addDays(weekDates[6], 1)].map(
      (date) => Number(date.slice(0, 4))
    )
  );

  const suggestionsByDate = new Map<
    string,
    Omit<PremiumDaySuggestion, "dayIndex">
  >();

  function addSuggestion(
    date: string,
    details: PremiumEventDetails
  ) {
    if (
      !weekDateSet.has(date) ||
      suggestionsByDate.has(date)
    ) {
      return;
    }

    suggestionsByDate.set(date, {
      date,
      ...details,
    });
  }

  for (const year of years) {
    const events = calendar({
      year,
      isHebrewYear: false,
      il: true,
      noModern: false,
      noMinorFast: true,
      noRoshChodesh: true,
      noSpecialShabbat: true,
    });

    for (const event of events) {
      const description = event.getDesc();
      const eventDate = formatGregorianDate(
        event.greg()
      );

      const details = getPremiumEventDetails(
        description
      );

      if (details) {
        addSuggestion(eventDate, details);
      }

      if (description === "Pesach VII") {
        addSuggestion(addDays(eventDate, -1), {
          name: "ערב שביעי של פסח",
          kind: "holiday",
        });
      }

      if (description === "Shmini Atzeret") {
        addSuggestion(addDays(eventDate, -1), {
          name: "ערב שמיני עצרת / שמחת תורה",
          kind: "holiday",
        });
      }
    }
  }

  return Array.from(suggestionsByDate.values())
    .map((suggestion) => ({
      ...suggestion,
      dayIndex: dayIndexByDate.get(suggestion.date)!,
    }))
    .sort((first, second) => first.dayIndex - second.dayIndex);
}

export function mergePremiumDays(
  premiumDays: readonly number[],
  suggestions: readonly PremiumDaySuggestion[]
): number[] {
  return Array.from(
    new Set([
      ...premiumDays,
      ...suggestions.map(
        (suggestion) => suggestion.dayIndex
      ),
    ])
  ).sort((first, second) => first - second);
}

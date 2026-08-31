import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import PremiumDaySuggestions from "../components/PremiumDaySuggestions";
import {
  getPremiumDaySuggestions,
  mergePremiumDays,
  type PremiumDaySuggestion,
} from "../lib/premiumCalendar";

function suggestionNames(weekStart: string): string[] {
  return getPremiumDaySuggestions(weekStart).map(
    (suggestion) => suggestion.name
  );
}

describe("Israeli premium calendar suggestions", () => {
  it("returns no suggestions for a regular week", () => {
    expect(
      getPremiumDaySuggestions("2026-08-30")
    ).toEqual([]);
  });

  it("includes Erev Rosh Hashana and both days of Rosh Hashana", () => {
    expect(suggestionNames("2026-09-06")).toEqual([
      "ערב ראש השנה",
      "ראש השנה א׳",
    ]);

    expect(suggestionNames("2026-09-13")).toEqual([
      "ראש השנה ב׳",
    ]);
  });

  it("includes Erev Yom Kippur and Yom Kippur", () => {
    expect(suggestionNames("2026-09-20")).toEqual(
      expect.arrayContaining([
        "ערב יום כיפור",
        "יום כיפור",
      ])
    );
  });

  it("includes Erev Sukkot and the first day of Sukkot", () => {
    expect(suggestionNames("2026-09-20")).toEqual(
      expect.arrayContaining([
        "ערב סוכות",
        "סוכות",
      ])
    );
  });

  it("excludes Sukkot Chol HaMoed but includes Erev Shmini Atzeret and Shmini Atzeret", () => {
    expect(suggestionNames("2026-09-27")).toEqual([
      "ערב שמיני עצרת / שמחת תורה",
      "שמיני עצרת / שמחת תורה",
    ]);
  });

  it("includes Erev Pesach and the first day while excluding Chol HaMoed", () => {
    expect(suggestionNames("2026-03-29")).toEqual([
      "ערב פסח",
      "פסח",
    ]);
  });

  it("derives Erev Pesach VII from the holiday date and includes Pesach VII", () => {
    expect(suggestionNames("2026-04-05")).toEqual([
      "ערב שביעי של פסח",
      "שביעי של פסח",
    ]);
  });

  it("includes Erev Shavuot and Shavuot", () => {
    expect(suggestionNames("2026-05-17")).toEqual([
      "ערב שבועות",
      "שבועות",
    ]);
  });

  it("includes the official Israeli Yom HaZikaron and Yom HaAtzmaut dates", () => {
    const suggestions = getPremiumDaySuggestions(
      "2026-04-19"
    );

    expect(suggestions).toMatchObject([
      {
        date: "2026-04-21",
        name: "יום הזיכרון",
        kind: "national",
      },
      {
        date: "2026-04-22",
        name: "יום העצמאות",
        kind: "national",
      },
    ]);
  });

  it("uses Hebcal's shifted official dates in 2025", () => {
    const suggestions = getPremiumDaySuggestions(
      "2025-04-27"
    );

    expect(suggestions).toMatchObject([
      {
        date: "2025-04-30",
        name: "יום הזיכרון",
      },
      {
        date: "2025-05-01",
        name: "יום העצמאות",
      },
    ]);
  });

  it("does not duplicate an existing premium day", () => {
    const suggestions: PremiumDaySuggestion[] = [
      {
        dayIndex: 5,
        date: "2026-09-11",
        name: "ערב ראש השנה",
        kind: "holiday",
      },
    ];

    expect(mergePremiumDays([5, 6], suggestions)).toEqual([
      5, 6,
    ]);
  });

  it("adds all pending suggestions through the existing premium day array", () => {
    const suggestions = getPremiumDaySuggestions(
      "2026-03-29"
    );

    expect(mergePremiumDays([5, 6], suggestions)).toEqual([
      3, 4, 5, 6,
    ]);
  });

  it("recomputes a different result after moving to another week", () => {
    expect(
      getPremiumDaySuggestions("2026-08-30")
    ).toEqual([]);

    expect(
      suggestionNames("2026-09-06")
    ).not.toEqual([]);
  });
});

describe("premium calendar suggestions UI", () => {
  it("renders nothing for a week without suggestions", () => {
    const markup = renderToStaticMarkup(
      createElement(PremiumDaySuggestions, {
        suggestions: [],
        premiumDays: [5],
        disabled: false,
        onAddDays: vi.fn(),
      })
    );

    expect(markup).toBe("");
  });

  it("shows add-all and marks suggestions that are already premium", () => {
    const suggestions = getPremiumDaySuggestions(
      "2026-09-06"
    );

    const markup = renderToStaticMarkup(
      createElement(PremiumDaySuggestions, {
        suggestions,
        premiumDays: [5],
        disabled: false,
        onAddDays: vi.fn(),
      })
    );

    expect(markup).toContain("הצעות לפי לוח השנה");
    expect(markup).toContain("הוסף את כל ההצעות");
    expect(markup).toContain("✓ יום פרמיה");
    expect(markup).toContain("+ הוסף ליום פרמיה");
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import AdminPreferencesCards from "../components/AdminPreferencesCards";
import PublishedScheduleGrid from "../components/PublishedScheduleGrid";
import { ShiftDefinition } from "../lib/types";

const twoShifts: ShiftDefinition[] = [
  {
    id: "day",
    name: "יום",
    payValue: 1,
    startTime: "08:00",
    durationMinutes: 60,
  },
  {
    id: "night",
    name: "לילה",
    payValue: 1,
    startTime: "20:00",
    durationMinutes: 60,
  },
];

describe("admin preference cards", () => {
  it("renders an editable, vertical seven-day view with full labels for two dynamic shifts", () => {
    const markup = renderToStaticMarkup(
      createElement(AdminPreferencesCards, {
        weekStart: "2026-08-30",
        weekStatus: "open",
        shiftDefinitions: twoShifts,
        preferences: {
          "hila-0-day": "want",
          "yaara-0-day": "can",
          "omer-0-day": "prefer_not",
          "hila-0-night": "cannot",
        },
        onPreferenceClick: vi.fn(),
      })
    );

    expect(markup.match(/<article/g)).toHaveLength(7);
    expect(markup.match(/<button/g)).toHaveLength(42);
    expect(markup).toContain("30.08");
    expect(markup).toContain("רוצה במיוחד");
    expect(markup).toContain("יכולה");
    expect(markup).toContain("מעדיפה שלא");
    expect(markup).toContain("לא יכולה");
    expect(markup).not.toContain("overflow-x-auto");
    expect(markup).not.toContain("disabled");
  });

  it("keeps preference cells visible but disables editing after publication", () => {
    const markup = renderToStaticMarkup(
      createElement(AdminPreferencesCards, {
        weekStart: "2026-08-30",
        weekStatus: "published",
        shiftDefinitions: twoShifts,
        preferences: {},
        onPreferenceClick: vi.fn(),
      })
    );

    expect(markup.match(/disabled=""/g)).toHaveLength(42);
    expect(markup).toContain("יכולה");
  });
});

describe("published schedule grid", () => {
  it("renders every dynamic shift with the employee color mapping and dates", () => {
    const fourShifts: ShiftDefinition[] = [
      ...twoShifts,
      {
        id: "late",
        name: "מאוחרת",
        payValue: 1,
        startTime: "22:00",
        durationMinutes: 60,
      },
      {
        id: "overnight",
        name: "לינת לילה",
        payValue: 1,
        startTime: "23:00",
        durationMinutes: 60,
      },
    ];

    const markup = renderToStaticMarkup(
      createElement(PublishedScheduleGrid, {
        weekStart: "2026-08-30",
        shiftDefinitions: fourShifts,
        assignments: [
          {
            dayIndex: 0,
            shiftType: "day",
            employee: "hila",
          },
          {
            dayIndex: 0,
            shiftType: "night",
            employee: "yaara",
          },
          {
            dayIndex: 0,
            shiftType: "late",
            employee: "omer",
          },
        ],
        title: "השיבוץ שפורסם",
      })
    );

    expect(markup).toContain("מאוחרת");
    expect(markup).toContain("לינת לילה");
    expect(markup).toContain("30.08");
    expect(markup).toContain("הילה");
    expect(markup).toContain("יערה");
    expect(markup).toContain("עומר");
    expect(markup).toContain("bg-blue-100");
    expect(markup).toContain("bg-pink-100");
    expect(markup).toContain("bg-emerald-100");
  });
});

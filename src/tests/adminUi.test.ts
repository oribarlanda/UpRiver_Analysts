import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import AdminPreferencesTable from "../components/AdminPreferencesTable";
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

const confirmations = {
  hila: {
    confirmed_at: "2026-08-29T09:30:00.000Z",
    changed_since_confirmation: false,
  },
  yaara: {
    confirmed_at: "2026-08-29T10:30:00.000Z",
    changed_since_confirmation: true,
  },
  omer: null,
};

describe("admin preference table", () => {
  it("renders a compact editable table with row-spanned days and full labels for two dynamic shifts", () => {
    const markup = renderToStaticMarkup(
      createElement(AdminPreferencesTable, {
        weekStart: "2026-08-30",
        weekStatus: "open",
        shiftDefinitions: twoShifts,
        preferences: {
          "hila-0-day": "want",
          "yaara-0-day": "can",
          "omer-0-day": "prefer_not",
          "hila-0-night": "cannot",
        },
        confirmations,
        confirmationsLoaded: true,
        onPreferenceClick: vi.fn(),
      })
    );

    expect(markup).toContain("<table");
    expect(markup).not.toContain("<article");
    expect(markup.match(/rowspan="2"/gi)).toHaveLength(7);
    expect(markup.match(/<button/g)).toHaveLength(42);
    expect(markup).toContain("30.08");
    expect(markup).toContain("רוצה במיוחד");
    expect(markup).toContain("יכולה");
    expect(markup).toContain("מעדיפה שלא");
    expect(markup).toContain("לא יכולה");
    expect(markup).toContain("אושרו");
    expect(markup).toContain("שונו מאז האישור");
    expect(markup).toContain("טרם אישרה");
    expect(markup).not.toContain("overflow-x-auto");
    expect(markup).not.toContain("disabled");
  });

  it("keeps preference cells visible but disables editing after publication", () => {
    const markup = renderToStaticMarkup(
      createElement(AdminPreferencesTable, {
        weekStart: "2026-08-30",
        weekStatus: "published",
        shiftDefinitions: twoShifts,
        preferences: {},
        confirmations,
        confirmationsLoaded: true,
        onPreferenceClick: vi.fn(),
      })
    );

    expect(markup.match(/disabled=""/g)).toHaveLength(42);
    expect(markup).toContain("יכולה");
  });

  it("keeps four dynamic shifts in one table with one day label per group", () => {
    const markup = renderToStaticMarkup(
      createElement(AdminPreferencesTable, {
        weekStart: "2026-08-30",
        weekStatus: "open",
        shiftDefinitions: fourShifts,
        preferences: {},
        confirmations,
        confirmationsLoaded: true,
        onPreferenceClick: vi.fn(),
      })
    );

    expect(markup.match(/rowspan="4"/gi)).toHaveLength(7);
    expect(markup.match(/<button/g)).toHaveLength(84);
    expect(markup).toContain("מאוחרת");
    expect(markup).toContain("לינת לילה");
  });
});

describe("published schedule grid", () => {
  it("renders every dynamic shift with the employee color mapping and dates", () => {
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

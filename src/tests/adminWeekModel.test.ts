import {
  describe,
  expect,
  it,
} from "vitest";

import { resolveAdminWeekPayload } from "../app/admin/[weekStart]/adminWeekModel";
import type {
  ShiftDefinition,
  WeekRow,
} from "@/lib/types";

function makeWeek(
  shiftDefinitions: ShiftDefinition[]
): WeekRow {
  return {
    id: "week-1",
    week_start: "2026-08-30",
    status: "open",
    premium_days: [5, 6],
    shift_definitions:
      shiftDefinitions,
    algorithm_priorities: null,
    published_at: null,
    created_at:
      "2026-08-30T00:00:00.000Z",
  };
}

const twoShifts: ShiftDefinition[] = [
  {
    id: "morning",
    name: "בוקר",
    payValue: 1.25,
    startTime: "08:00",
    durationMinutes: 60,
  },
  {
    id: "evening",
    name: "ערב",
    payValue: 1.25,
    startTime: "21:00",
    durationMinutes: 60,
  },
];

describe("resolveAdminWeekPayload", () => {
  it("keeps a two-shift week without adding legacy columns", () => {
    const resolved =
      resolveAdminWeekPayload({
        week: makeWeek(twoShifts),
      });

    expect(
      resolved.shift_definitions.map(
        (shift) => shift.id
      )
    ).toEqual(["morning", "evening"]);
  });

  it("uses the API shift definitions as the manager source of truth", () => {
    const legacyWeek = makeWeek([
      ...twoShifts.slice(0, 1),
      {
        id: "afternoon",
        name: "צהריים",
        payValue: 0.5,
        startTime: "14:00",
        durationMinutes: 30,
      },
      ...twoShifts.slice(1),
    ]);

    const resolved =
      resolveAdminWeekPayload({
        week: legacyWeek,
        shiftDefinitions: twoShifts,
      });

    expect(
      resolved.shift_definitions.map(
        (shift) => shift.name
      )
    ).toEqual(["בוקר", "ערב"]);
  });

  it("does not silently fall back to the hardcoded three-shift structure", () => {
    expect(() =>
      resolveAdminWeekPayload({
        week: makeWeek([]),
        shiftDefinitions: [],
      })
    ).toThrow(
      "Missing configured shift definitions"
    );
  });
});

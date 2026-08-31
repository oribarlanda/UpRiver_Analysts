import {
  describe,
  expect,
  it,
} from "vitest";

import {
  AlgorithmPriority,
  DEFAULT_ALGORITHM_PRIORITIES,
  getEffectiveAlgorithmPriorities,
  WeekRow,
} from "../lib/types";
import {
  algorithmPriorityOrderSchema,
} from "../lib/zodSchemas";

function makeWeek(
  weekStart: string,
  priorities: AlgorithmPriority[] | null
): WeekRow {
  return {
    id: weekStart,
    week_start: weekStart,
    status: "open",
    premium_days: [5, 6],
    shift_definitions: [
      {
        id: "morning",
        name: "בוקר",
        payValue: 1.25,
        startTime: "08:00",
        durationMinutes: 60,
      },
    ],
    algorithm_priorities: priorities,
    balance_week_enabled_override: null,
    published_at: null,
    created_at:
      "2026-08-30T00:00:00.000Z",
  };
}

describe("per-week algorithm priorities", () => {
  it("defines the exact requested legacy/default order", () => {
    expect(
      DEFAULT_ALGORITHM_PRIORITIES
    ).toEqual([
      "weekly_balance",
      "premium_boundary_coverage",
      "avoid_prefer_not",
      "fair_wants",
      "avoid_triple_shifts",
      "midweek_type_coverage",
      "avoid_quick_return",
    ]);
  });

  it("keeps a custom order isolated to its own week", () => {
    const custom: AlgorithmPriority[] = [
      "avoid_prefer_not",
      "weekly_balance",
      "premium_boundary_coverage",
      "fair_wants",
      "avoid_triple_shifts",
      "midweek_type_coverage",
      "avoid_quick_return",
    ];
    const firstWeek = makeWeek(
      "2026-08-30",
      custom
    );
    const secondWeek = makeWeek(
      "2026-09-06",
      null
    );

    expect(
      getEffectiveAlgorithmPriorities(
        firstWeek.algorithm_priorities
      )
    ).toEqual(custom);
    expect(
      getEffectiveAlgorithmPriorities(
        secondWeek.algorithm_priorities
      )
    ).toEqual(
      DEFAULT_ALGORITHM_PRIORITIES
    );
  });

  it("accepts only a complete one-of-each permutation", () => {
    expect(
      algorithmPriorityOrderSchema.safeParse(
        DEFAULT_ALGORITHM_PRIORITIES
      ).success
    ).toBe(true);

    expect(
      algorithmPriorityOrderSchema.safeParse([
        ...DEFAULT_ALGORITHM_PRIORITIES.slice(
          0,
          -1
        ),
        "weekly_balance",
      ]).success
    ).toBe(false);
  });
});

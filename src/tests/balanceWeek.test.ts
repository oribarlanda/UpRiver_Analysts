import {
  describe,
  expect,
  it,
} from "vitest";

import {
  getBalanceWeekInfo,
  getEffectiveBalanceWeekEnabled,
} from "../lib/monthlyBalance";

describe("per-week monthly balance override", () => {
  const balanceWeekStart = "2026-08-23";
  const regularWeekStart = "2026-08-30";

  it("keeps a detected balance week enabled when no override exists", () => {
    const info = getBalanceWeekInfo(
      balanceWeekStart
    );

    expect(info.isBalanceWeek).toBe(true);
    expect(
      getEffectiveBalanceWeekEnabled(
        info.isBalanceWeek,
        null
      )
    ).toBe(true);
  });

  it("supports disabling and enabling the detected balance week again", () => {
    expect(
      getEffectiveBalanceWeekEnabled(true, false)
    ).toBe(false);
    expect(
      getEffectiveBalanceWeekEnabled(true, true)
    ).toBe(true);
  });

  it("never turns an ordinary week into a balance week", () => {
    const info = getBalanceWeekInfo(
      regularWeekStart
    );

    expect(info.isBalanceWeek).toBe(false);
    expect(
      getEffectiveBalanceWeekEnabled(
        info.isBalanceWeek,
        true
      )
    ).toBe(false);
    expect(
      getEffectiveBalanceWeekEnabled(
        info.isBalanceWeek,
        false
      )
    ).toBe(false);
  });

  it("keeps overrides isolated by week", () => {
    const overrides = new Map<string, boolean | null>([
      ["2026-08-23", false],
      ["2026-09-27", null],
    ]);

    expect(
      getEffectiveBalanceWeekEnabled(
        getBalanceWeekInfo("2026-08-23")
          .isBalanceWeek,
        overrides.get("2026-08-23")
      )
    ).toBe(false);
    expect(
      getEffectiveBalanceWeekEnabled(
        getBalanceWeekInfo("2026-09-27")
          .isBalanceWeek,
        overrides.get("2026-09-27")
      )
    ).toBe(true);
  });
});

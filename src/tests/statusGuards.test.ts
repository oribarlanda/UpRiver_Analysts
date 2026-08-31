import { describe, expect, it } from "vitest";
import {
  StatusError,
  assertAlgorithmPrioritiesEditable,
  assertBalanceWeekEditable,
  assertAssignmentsEditable,
  assertGeneratable,
  assertPremiumDaysEditable,
  assertPreferencesComplete,
  assertPreferencesEditable,
  assertPublishable,
  assertReopenable,
} from "../lib/statusGuards";

describe("assertPreferencesEditable", () => {
  it("allows editing when open", () => {
    expect(() => assertPreferencesEditable("open")).not.toThrow();
  });
  it("blocks editing when draft or published", () => {
    expect(() => assertPreferencesEditable("draft")).toThrow(StatusError);
    expect(() => assertPreferencesEditable("published")).toThrow(StatusError);
  });
});

describe("assertPremiumDaysEditable", () => {
  it("allows changes when open or draft", () => {
    expect(() => assertPremiumDaysEditable("open")).not.toThrow();
    expect(() => assertPremiumDaysEditable("draft")).not.toThrow();
  });
  it("blocks changes once published", () => {
    expect(() => assertPremiumDaysEditable("published")).toThrow(StatusError);
  });
});

describe("assertAlgorithmPrioritiesEditable", () => {
  it("allows changes when open or draft", () => {
    expect(() =>
      assertAlgorithmPrioritiesEditable(
        "open"
      )
    ).not.toThrow();
    expect(() =>
      assertAlgorithmPrioritiesEditable(
        "draft"
      )
    ).not.toThrow();
  });

  it("blocks changes once published", () => {
    expect(() =>
      assertAlgorithmPrioritiesEditable(
        "published"
      )
    ).toThrow(StatusError);
  });
});

describe("assertBalanceWeekEditable", () => {
  it("allows changes when open or draft", () => {
    expect(() =>
      assertBalanceWeekEditable("open")
    ).not.toThrow();
    expect(() =>
      assertBalanceWeekEditable("draft")
    ).not.toThrow();
  });

  it("blocks changes once published", () => {
    expect(() =>
      assertBalanceWeekEditable("published")
    ).toThrow(StatusError);
  });
});

describe("assertGeneratable", () => {
  it("allows generation when open or draft (regeneration)", () => {
    expect(() => assertGeneratable("open")).not.toThrow();
    expect(() => assertGeneratable("draft")).not.toThrow();
  });
  it("blocks generation once published", () => {
    expect(() => assertGeneratable("published")).toThrow(StatusError);
  });
});

describe("assertPreferencesComplete", () => {
  it("allows generation with zero missing preferences", () => {
    expect(() => assertPreferencesComplete(0)).not.toThrow();
  });
  it("blocks generation with any missing preferences", () => {
    expect(() => assertPreferencesComplete(1)).toThrow(StatusError);
    expect(() => assertPreferencesComplete(63)).toThrow(StatusError);
  });
});

describe("assertAssignmentsEditable", () => {
  it("blocks manual edits while open (must generate first)", () => {
    expect(() => assertAssignmentsEditable("open")).toThrow(StatusError);
  });
  it("allows manual edits while draft", () => {
    expect(() => assertAssignmentsEditable("draft")).not.toThrow();
  });
  it("blocks manual edits once published", () => {
    expect(() => assertAssignmentsEditable("published")).toThrow(StatusError);
  });
});

describe("assertPublishable", () => {
  it("blocks publishing unless status is draft", () => {
    expect(() => assertPublishable("open", 0)).toThrow(StatusError);
    expect(() => assertPublishable("published", 0)).toThrow(StatusError);
  });
  it("blocks publishing a draft week with any missing assignment", () => {
    expect(() => assertPublishable("draft", 1)).toThrow(StatusError);
    expect(() => assertPublishable("draft", 21)).toThrow(StatusError);
  });
  it("allows publishing a draft week with all 21 shifts assigned", () => {
    expect(() => assertPublishable("draft", 0)).not.toThrow();
  });
});

describe("assertReopenable", () => {
  it("allows draft -> open", () => {
    expect(() => assertReopenable("draft", "open")).not.toThrow();
  });
  it("allows published -> draft", () => {
    expect(() => assertReopenable("published", "draft")).not.toThrow();
  });
  it("allows published -> open", () => {
    expect(() => assertReopenable("published", "open")).not.toThrow();
  });
  it("blocks open -> draft", () => {
    expect(() => assertReopenable("open", "draft")).toThrow(StatusError);
  });
  it("blocks a transition to the same status (open->open, draft->draft, published->published)", () => {
    expect(() => assertReopenable("open", "open")).toThrow(StatusError);
    expect(() => assertReopenable("draft", "draft")).toThrow(StatusError);
    expect(() => assertReopenable("published", "published")).toThrow(StatusError);
  });
  it("blocks open -> published (not a reopen transition)", () => {
    expect(() => assertReopenable("open", "published")).toThrow(StatusError);
  });
  it("blocks draft -> published (not a reopen transition)", () => {
    expect(() => assertReopenable("draft", "published")).toThrow(StatusError);
  });
});

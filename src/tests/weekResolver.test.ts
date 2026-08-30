import { describe, expect, it } from "vitest";
import { resolveWeek, WeekRepo } from "../lib/dbCore";
import { WeekRow } from "../lib/types";

/**
 * An in-memory fake that mimics Postgres's guarantee for
 * `INSERT ... ON CONFLICT (week_start) DO NOTHING`: the check-and-insert
 * happens as a single atomic step (no `await` between checking existence
 * and writing), exactly like a real unique-index insert is atomic at the
 * database level. This lets us verify that `resolveWeek`'s orchestration
 * (call insertIfAbsent, then always re-fetch) correctly converges
 * concurrent callers on the same single row.
 */
function makeFakeRepo() {
  const store = new Map<string, WeekRow>();
  let idCounter = 0;
  let insertCallCount = 0;

  const repo: WeekRepo = {
    async fetchByStart(weekStart) {
      // Simulate network latency.
      await new Promise((r) => setTimeout(r, 1));
      return store.get(weekStart) ?? null;
    },
    async insertIfAbsent(weekStart, defaults) {
      insertCallCount += 1;
      // Simulate some network latency BEFORE the atomic write, so that
      // multiple concurrent calls are genuinely "in flight" together -
      // but the check+write itself is one synchronous step, faithfully
      // representing Postgres's atomic unique-constraint insert.
      await new Promise((r) => setTimeout(r, 1));
      if (!store.has(weekStart)) {
        idCounter += 1;
        store.set(weekStart, {
          id: `week-${idCounter}`,
          week_start: weekStart,
          status: defaults.status,
          premium_days: defaults.premiumDays,
          shift_definitions: defaults.shiftDefinitions.map((shift) => ({
            ...shift,
          })),
          algorithm_priorities: null,
          published_at: null,
          created_at: new Date().toISOString(),
        });
      }
      // ON CONFLICT DO NOTHING never throws for a duplicate - it's a no-op.
    },
  };

  return { repo, store, getInsertCallCount: () => insertCallCount };
}

describe("resolveWeek (race-condition safety)", () => {
  it("returns the same row for a single caller", async () => {
    const { repo } = makeFakeRepo();
    const row = await resolveWeek(repo, "2026-08-02");
    expect(row.week_start).toBe("2026-08-02");
  });

  it("converges multiple concurrent callers on exactly one created row", async () => {
    const { repo, store } = makeFakeRepo();

    const results = await Promise.all([
      resolveWeek(repo, "2026-08-02"),
      resolveWeek(repo, "2026-08-02"),
      resolveWeek(repo, "2026-08-02"),
      resolveWeek(repo, "2026-08-02"),
      resolveWeek(repo, "2026-08-02"),
    ]);

    // Only one row should ever have been created for this week_start.
    expect(store.size).toBe(1);

    // Every concurrent caller must get back the SAME row id.
    const ids = new Set(results.map((r) => r.id));
    expect(ids.size).toBe(1);
  });

  it("does not interfere across different weeks", async () => {
    const { repo, store } = makeFakeRepo();
    await Promise.all([
      resolveWeek(repo, "2026-08-02"),
      resolveWeek(repo, "2026-08-09"),
    ]);
    expect(store.size).toBe(2);
  });
});

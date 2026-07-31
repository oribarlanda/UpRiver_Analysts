import { describe, expect, it } from "vitest";
import { AssignmentsReplaceRepo, replaceAssignmentsWith } from "../lib/dbCore";

/**
 * Simulates the atomicity guarantee of the `replace_week_assignments`
 * Postgres function (migration 0002): a "transaction" either fully
 * commits (old rows replaced by new ones) or, on failure, leaves the
 * previously committed rows completely untouched - never partially
 * deleted.
 */
function makeFakeAtomicRepo(options: { failOnRowCount?: number } = {}) {
  let committed: { day_index: number; shift_type: string; employee: string; source: string }[] = [];
  let callCount = 0;

  const repo: AssignmentsReplaceRepo = {
    async replaceAll(_weekId, rows) {
      callCount += 1;
      if (options.failOnRowCount !== undefined && rows.length === options.failOnRowCount) {
        // Simulate a failure inside the Postgres function (e.g. a check
        // constraint violation on one row). Because the real function
        // runs delete+insert in one transaction, NOTHING is committed -
        // `committed` must remain exactly as it was before this call.
        throw new Error("simulated constraint violation");
      }
      // Atomic "commit": old rows are fully replaced by new ones in one step.
      committed = rows.map((r) => ({ ...r }));
    },
  };

  return {
    repo,
    getCommitted: () => committed,
    getCallCount: () => callCount,
  };
}

describe("replaceAssignmentsWith (atomicity)", () => {
  it("commits the full new set on success", async () => {
    const { repo, getCommitted } = makeFakeAtomicRepo();
    await replaceAssignmentsWith(repo, "week-1", [
      { dayIndex: 0, shiftType: "morning", employee: "hila", source: "auto" },
      { dayIndex: 0, shiftType: "afternoon", employee: "yaara", source: "auto" },
    ]);
    expect(getCommitted().length).toBe(2);
  });

  it("filters out unassigned (null-employee) slots before sending to the repo", async () => {
    const { repo, getCommitted } = makeFakeAtomicRepo();
    await replaceAssignmentsWith(repo, "week-1", [
      { dayIndex: 0, shiftType: "morning", employee: "hila", source: "auto" },
      { dayIndex: 0, shiftType: "afternoon", employee: null, source: "auto" },
    ]);
    expect(getCommitted().length).toBe(1);
  });

  it("leaves the previous board completely untouched when the atomic operation fails", async () => {
    const { repo, getCommitted } = makeFakeAtomicRepo({ failOnRowCount: 2 });

    // First, commit an initial valid board (1 row - does not match the
    // configured failure trigger of 2 rows).
    await replaceAssignmentsWith(repo, "week-1", [
      { dayIndex: 0, shiftType: "morning", employee: "hila", source: "auto" },
    ]);
    expect(getCommitted().length).toBe(1);
    const before = getCommitted();

    // Now attempt a replace that will fail inside the "transaction" (2
    // rows triggers the configured failure) - the OLD delete-then-insert
    // implementation would have already deleted the old board before the
    // failing insert; the atomic implementation must not.
    const failingRows = [
      { dayIndex: 0, shiftType: "morning" as const, employee: "hila" as const, source: "auto" as const },
      { dayIndex: 1, shiftType: "morning" as const, employee: "yaara" as const, source: "auto" as const },
    ];
    await expect(replaceAssignmentsWith(repo, "week-1", failingRows)).rejects.toThrow();

    // The board must be exactly what it was before the failed call.
    expect(getCommitted()).toEqual(before);
  });

  it("only calls the repo once per replace (single atomic call, not separate delete+insert)", async () => {
    const { repo, getCallCount } = makeFakeAtomicRepo();
    await replaceAssignmentsWith(repo, "week-1", [
      { dayIndex: 0, shiftType: "morning", employee: "hila", source: "auto" },
    ]);
    expect(getCallCount()).toBe(1);
  });
});

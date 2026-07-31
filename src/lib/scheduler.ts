import {
  Employee,
  EMPLOYEES,
  GeneratedAssignment,
  PreferenceValue,
  PREFERENCE_SCORE,
  ScheduleResult,
  ScheduleWarning,
  ShiftSlot,
} from "./types";

/**
 * Exact Dynamic Programming scheduler.
 *
 * Optimizes, in strict lexicographic order, over ALL 21 shifts together
 * (never per-day, never greedy):
 *   1. Never assigns a shift to an employee who marked it "cannot".
 *   2. Minimizes the gap between the highest-paid and lowest-paid employee.
 *   3. Minimizes the number of shifts assigned against "prefer_not".
 *   4. Maximizes total preference score (want=3, can=1, prefer_not=0).
 *   5. Minimizes variance between the three pay sums.
 *   6. Deterministic tie-break (fixed iteration + employee order), so the
 *      same input always produces the same output.
 *
 * State design
 * ------------
 * The sum of ALL 21 shift unit-values is fixed regardless of assignment
 * (every shift is assigned to exactly one employee). So at any point in
 * the sequence, if we know the cumulative pay of Hila and Yaara, Omer's
 * cumulative pay is simply (processed-total - hila - yaara). This lets us
 * use a compact state of (hilaSum, yaaraSum) instead of tracking all three.
 *
 * Because objectives 2 and 5 (gap, variance) depend only on the FINAL
 * state and not on the path taken, while objectives 3 and 4 are additive
 * along the path, the algorithm runs in three phases:
 *   A. Forward reachability - which (hila,yaara) end-states are reachable.
 *   B. Pick the minimal gap G* among reachable end-states, then compute,
 *      backward, the set of states at every step that can still reach an
 *      end-state with gap === G*.
 *   C. Forward cost DP restricted to those valid states, minimizing
 *      (prefer_not count, then maximizing preference score). Among the
 *      resulting best final states (all sharing gap === G*), break ties
 *      by minimal variance, then deterministic ordering.
 */

type Pref = (employee: Employee, slotIndex: number) => PreferenceValue;

interface DPCostEntry {
  obj3: number; // prefer_not count (minimize)
  obj4: number; // preference score (maximize)
  prevKey: string | null;
  prevEmployee: Employee | "unassigned" | null;
}

function stateKey(h: number, y: number): string {
  return `${h},${y}`;
}

function feasibleOptions(
  slotIndex: number,
  pref: Pref
): Employee[] {
  return EMPLOYEES.filter((e) => pref(e, slotIndex) !== "cannot");
}

export function generateAssignments(
  slots: ShiftSlot[],
  preferenceLookup: (employee: Employee, dayIndex: number, shiftType: string) => PreferenceValue
): ScheduleResult {
  const n = slots.length;

  const pref: Pref = (employee, slotIndex) =>
    preferenceLookup(employee, slots[slotIndex].dayIndex, slots[slotIndex].shiftType);

  // Prefix totals: processed-total after k slots (blocked slots contribute 0).
  const prefixTotal: number[] = [0];
  const blocked: boolean[] = [];
  const options: Employee[][] = [];
  for (let i = 0; i < n; i++) {
    const opts = feasibleOptions(i, pref);
    options.push(opts);
    const isBlocked = opts.length === 0;
    blocked.push(isBlocked);
    prefixTotal.push(prefixTotal[i] + (isBlocked ? 0 : slots[i].unit));
  }

  // --- Phase A: forward reachability of (hilaSum, yaaraSum) states ---
  let reachable: Set<string> = new Set([stateKey(0, 0)]);
  const reachableByStep: Set<string>[] = [reachable];

  for (let i = 0; i < n; i++) {
    const next: Set<string> = new Set();
    const opts = blocked[i] ? (["unassigned"] as const) : options[i];
    for (const key of reachable) {
      const [h, y] = key.split(",").map(Number);
      for (const opt of opts) {
        let nh = h;
        let ny = y;
        if (opt === "hila") nh = h + slots[i].unit;
        else if (opt === "yaara") ny = y + slots[i].unit;
        // "omer" and "unassigned" leave h,y unchanged
        next.add(stateKey(nh, ny));
      }
    }
    reachable = next;
    reachableByStep.push(reachable);
  }

  // --- Determine minimal gap G* among reachable end-states ---
  function gapOf(h: number, y: number): number {
    const total = prefixTotal[n];
    const o = total - h - y;
    return Math.max(h, y, o) - Math.min(h, y, o);
  }

  function varianceOf(h: number, y: number): number {
    const total = prefixTotal[n];
    const o = total - h - y;
    const mean = total / 3;
    return (h - mean) ** 2 + (y - mean) ** 2 + (o - mean) ** 2;
  }

  let bestGap = Infinity;
  for (const key of reachableByStep[n]) {
    const [h, y] = key.split(",").map(Number);
    const g = gapOf(h, y);
    if (g < bestGap) bestGap = g;
  }

  // --- Phase B: backward-valid state sets (can reach an allowed end-state) ---
  const validByStep: Set<string>[] = new Array(n + 1);
  validByStep[n] = new Set(
    Array.from(reachableByStep[n]).filter((key) => {
      const [h, y] = key.split(",").map(Number);
      return gapOf(h, y) === bestGap;
    })
  );

  for (let i = n - 1; i >= 0; i--) {
    const valid = new Set<string>();
    const opts = blocked[i] ? (["unassigned"] as const) : options[i];
    for (const key of reachableByStep[i]) {
      const [h, y] = key.split(",").map(Number);
      for (const opt of opts) {
        let nh = h;
        let ny = y;
        if (opt === "hila") nh = h + slots[i].unit;
        else if (opt === "yaara") ny = y + slots[i].unit;
        if (validByStep[i + 1].has(stateKey(nh, ny))) {
          valid.add(key);
          break;
        }
      }
    }
    validByStep[i] = valid;
  }

  // --- Phase C: forward cost DP (minimize prefer_not count, maximize score) ---
  let dp: Map<string, DPCostEntry> = new Map([
    [stateKey(0, 0), { obj3: 0, obj4: 0, prevKey: null, prevEmployee: null }],
  ]);
  const dpByStep: Map<string, DPCostEntry>[] = [dp];

  function isBetter(a: DPCostEntry, b: DPCostEntry): boolean {
    // Lower obj3 wins; tie -> higher obj4 wins.
    if (a.obj3 !== b.obj3) return a.obj3 < b.obj3;
    return a.obj4 > b.obj4;
  }

  for (let i = 0; i < n; i++) {
    const next: Map<string, DPCostEntry> = new Map();
    const opts = blocked[i] ? (["unassigned"] as const) : options[i];
    // Deterministic iteration: sort state keys, then iterate options in fixed order.
    const sortedKeys = Array.from(dp.keys()).sort();
    for (const key of sortedKeys) {
      if (!validByStep[i].has(key)) continue;
      const cur = dp.get(key)!;
      const [h, y] = key.split(",").map(Number);
      for (const opt of opts) {
        let nh = h;
        let ny = y;
        let inc3 = 0;
        let inc4 = 0;
        if (opt !== "unassigned") {
          const p = pref(opt as Employee, i);
          inc3 = p === "prefer_not" ? 1 : 0;
          inc4 = PREFERENCE_SCORE[p];
        }
        if (opt === "hila") nh = h + slots[i].unit;
        else if (opt === "yaara") ny = y + slots[i].unit;

        const nKey = stateKey(nh, ny);
        if (!validByStep[i + 1].has(nKey)) continue;

        const candidate: DPCostEntry = {
          obj3: cur.obj3 + inc3,
          obj4: cur.obj4 + inc4,
          prevKey: key,
          prevEmployee: opt,
        };
        const existing = next.get(nKey);
        if (!existing || isBetter(candidate, existing)) {
          next.set(nKey, candidate);
        }
      }
    }
    dp = next;
    dpByStep.push(dp);
  }

  // --- Pick best final state: obj3 asc, obj4 desc, variance asc, deterministic ---
  let bestKey: string | null = null;
  let bestEntry: DPCostEntry | null = null;
  let bestVariance = Infinity;
  const finalKeys = Array.from(dp.keys()).sort();
  for (const key of finalKeys) {
    const entry = dp.get(key)!;
    const [h, y] = key.split(",").map(Number);
    const variance = varianceOf(h, y);
    if (bestEntry === null) {
      bestKey = key;
      bestEntry = entry;
      bestVariance = variance;
      continue;
    }
    if (isBetter(entry, bestEntry)) {
      bestKey = key;
      bestEntry = entry;
      bestVariance = variance;
    } else if (entry.obj3 === bestEntry.obj3 && entry.obj4 === bestEntry.obj4) {
      if (variance < bestVariance) {
        bestKey = key;
        bestEntry = entry;
        bestVariance = variance;
      }
    }
  }

  // --- Reconstruct path via backpointers ---
  const assignmentsRev: (Employee | "unassigned")[] = [];
  let curKey = bestKey;
  for (let i = n; i > 0; i--) {
    const entry = dpByStep[i].get(curKey!)!;
    assignmentsRev.push(entry.prevEmployee as Employee | "unassigned");
    curKey = entry.prevKey;
  }
  const assignmentsOptions = assignmentsRev.reverse();

  const assignments: GeneratedAssignment[] = [];
  const blockedSlots: { dayIndex: number; shiftType: ShiftSlot["shiftType"] }[] = [];
  const sums: Record<Employee, number> = { hila: 0, yaara: 0, omer: 0 };
  const warnings: ScheduleWarning[] = [];

  for (let i = 0; i < n; i++) {
    const opt = assignmentsOptions[i];
    const slot = slots[i];
    if (opt === "unassigned") {
      blockedSlots.push({ dayIndex: slot.dayIndex, shiftType: slot.shiftType });
      assignments.push({ dayIndex: slot.dayIndex, shiftType: slot.shiftType, employee: null });
      continue;
    }
    sums[opt] += slot.unit;
    assignments.push({ dayIndex: slot.dayIndex, shiftType: slot.shiftType, employee: opt });
    const p = pref(opt, i);
    if (p === "prefer_not" || p === "cannot") {
      warnings.push({ dayIndex: slot.dayIndex, shiftType: slot.shiftType, employee: opt, preference: p });
    }
  }

  const total = sums.hila + sums.yaara + sums.omer;
  const gapUnits = Math.max(sums.hila, sums.yaara, sums.omer) - Math.min(sums.hila, sums.yaara, sums.omer);
  const maxSum = Math.max(sums.hila, sums.yaara, sums.omer);
  const gapPercent = maxSum > 0 ? (gapUnits / maxSum) * 100 : 0;

  return {
    assignments,
    blockedSlots,
    sums,
    gapUnits,
    gapPercent,
    warnings,
  };
}

/**
 * Recomputes pay sums and preference-violation warnings for an arbitrary
 * (possibly manually-edited) assignment list. Used by the admin screen for
 * live recalculation after manual overrides.
 */
export function recomputeFromAssignments(
  slots: ShiftSlot[],
  assignments: GeneratedAssignment[],
  preferenceLookup: (employee: Employee, dayIndex: number, shiftType: string) => PreferenceValue
): { sums: Record<Employee, number>; gapUnits: number; gapPercent: number; warnings: ScheduleWarning[] } {
  const sums: Record<Employee, number> = { hila: 0, yaara: 0, omer: 0 };
  const warnings: ScheduleWarning[] = [];

  const slotMap = new Map<string, ShiftSlot>();
  for (const s of slots) slotMap.set(`${s.dayIndex}-${s.shiftType}`, s);

  for (const a of assignments) {
    if (!a.employee) continue;
    const slot = slotMap.get(`${a.dayIndex}-${a.shiftType}`);
    if (!slot) continue;
    sums[a.employee] += slot.unit;
    const p = preferenceLookup(a.employee, a.dayIndex, a.shiftType);
    if (p === "prefer_not" || p === "cannot") {
      warnings.push({ dayIndex: a.dayIndex, shiftType: a.shiftType, employee: a.employee, preference: p });
    }
  }

  const gapUnits = Math.max(sums.hila, sums.yaara, sums.omer) - Math.min(sums.hila, sums.yaara, sums.omer);
  const maxSum = Math.max(sums.hila, sums.yaara, sums.omer);
  const gapPercent = maxSum > 0 ? (gapUnits / maxSum) * 100 : 0;

  return { sums, gapUnits, gapPercent, warnings };
}

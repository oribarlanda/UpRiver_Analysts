import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getCurrentSession,
  isAdmin,
} from "@/lib/auth";

import {
  getOrCreateWeek,
  getPreferences,
  replaceAssignments,
} from "@/lib/db";

import {
  generateSchema,
} from "@/lib/zodSchemas";

import {
  buildWeekSlots,
} from "@/lib/weekSlots";

import {
  generateAssignments,
} from "@/lib/scheduler";

import {
  findMissingPreferences,
  groupMissingPreferencesByEmployee,
} from "@/lib/completeness";

import {
  assertGeneratable,
  assertPreferencesComplete,
  StatusError,
} from "@/lib/statusGuards";

import {
  getMonthlyBalanceContext,
} from "@/lib/monthlyBalanceServer";

import {
  Employee,
  getEffectiveAlgorithmPriorities,
  PreferenceValue,
  ShiftType,
} from "@/lib/types";

function rpcErrorToMessage(
  err: unknown
): string | null {
  const message =
    err instanceof Error
      ? err.message
      : typeof err ===
          "string"
        ? err
        : "";

  if (
    message.includes(
      "WEEK_NOT_FOUND"
    )
  ) {
    return "השבוע לא נמצא.";
  }

  if (
    message.includes(
      "WEEK_ALREADY_PUBLISHED"
    )
  ) {
    return "לא ניתן ליצור שיבוץ חדש לשבוע שפורסם. יש לפתוח מחדש.";
  }

  return null;
}

export async function POST(
  req: NextRequest
) {
  const session =
    await getCurrentSession();

  if (
    !session ||
    !isAdmin(
      session.role
    )
  ) {
    return NextResponse.json(
      {
        error:
          "גישה זו מיועדת למנהל בלבד.",
      },
      {
        status: 403,
      }
    );
  }

  let body:
    unknown;

  try {
    body =
      await req.json();
  } catch {
    return NextResponse.json(
      {
        error:
          "בקשה לא תקינה.",
      },
      {
        status: 400,
      }
    );
  }

  const parsed =
    generateSchema.safeParse(
      body
    );

  if (
    !parsed.success
  ) {
    return NextResponse.json(
      {
        error:
          "נתונים לא תקינים.",
      },
      {
        status: 400,
      }
    );
  }

  const week =
    await getOrCreateWeek(
      parsed.data
        .weekStart
    );

  const shiftDefinitions =
    week.shift_definitions;

  const shiftTypes =
    shiftDefinitions.map(
      (shift) => shift.id
    );

  const preferences =
    await getPreferences(
      week.id,
      shiftTypes
    );

  const missing =
    findMissingPreferences(
      preferences,
      shiftTypes
    );

  try {
    assertGeneratable(
      week.status
    );

    assertPreferencesComplete(
      missing.length
    );
  } catch (err) {
    if (
      err instanceof
      StatusError
    ) {
      return NextResponse.json(
        {
          error:
            err.message,

          missingPreferences:
            missing,

          missingPreferencesByEmployee:
            groupMissingPreferencesByEmployee(
              missing
            ),
        },
        {
          status: 409,
        }
      );
    }

    throw err;
  }

  const prefMap =
    new Map<
      string,
      PreferenceValue
    >();

  for (
    const preference of
    preferences
  ) {
    prefMap.set(
      `${preference.employee}-${preference.day_index}-${preference.shift_type}`,
      preference.preference
    );
  }

  const lookup = (
    employee: Employee,
    dayIndex: number,
    shiftType: string
  ): PreferenceValue => {
    const value =
      prefMap.get(
        `${employee}-${dayIndex}-${shiftType}`
      );

    if (!value) {
      throw new Error(
        `Missing preference for ${employee} day=${dayIndex} shift=${shiftType} despite completeness check.`
      );
    }

    return value;
  };

  const slots =
    buildWeekSlots(
      week.premium_days,
      shiftDefinitions
    );

  /**
   * On ordinary weeks this resolves immediately as balanceWeek=false.
   *
   * On a balance week it calculates the totals of the previous
   * PUBLISHED weeks since the previous balance week.
   */
  const balanceContext =
    await getMonthlyBalanceContext(
      parsed.data
        .weekStart
    );

  const result =
    generateAssignments(
      slots,
      lookup,
      {
        balanceWeek:
          balanceContext.isBalanceWeek,

        historicalSums:
          balanceContext.previousTotals,

        priorityOrder:
          getEffectiveAlgorithmPriorities(
            week.algorithm_priorities
          ),
      }
    );

  try {
    await replaceAssignments(
      week.id,

      result.assignments.map(
        (assignment) => ({
          dayIndex:
            assignment.dayIndex,

          shiftType:
            assignment.shiftType as ShiftType,

          employee:
            assignment.employee,

          source:
            "auto" as const,
        })
      )
    );
  } catch (err) {
    const friendlyMessage =
      rpcErrorToMessage(
        err
      );

    if (
      friendlyMessage
    ) {
      return NextResponse.json(
        {
          error:
            friendlyMessage,
        },
        {
          status: 409,
        }
      );
    }

    throw err;
  }

  const projectedTotals = {
    hila:
      balanceContext
        .previousTotals
        .hila +
      result.sums.hila,

    yaara:
      balanceContext
        .previousTotals
        .yaara +
      result.sums.yaara,

    omer:
      balanceContext
        .previousTotals
        .omer +
      result.sums.omer,
  };

  const projectedValues =
    Object.values(
      projectedTotals
    );

  const projectedGapUnits =
    Math.max(
      ...projectedValues
    ) -
    Math.min(
      ...projectedValues
    );

  return NextResponse.json({
    ok: true,

    result: {
      sums:
        result.sums,

      gapUnits:
        result.gapUnits,

      gapPercent:
        result.gapPercent,

      blockedSlots:
        result.blockedSlots,

      warnings:
        result.warnings,

      monthlyBalance:
        balanceContext.isBalanceWeek
          ? {
              isBalanceWeek:
                true,

              balanceMonthLabel:
                balanceContext.balanceMonthLabel,

              previousTotals:
                balanceContext.previousTotals,

              projectedTotals,

              projectedGapUnits,
            }
          : null,
    },
  });
}

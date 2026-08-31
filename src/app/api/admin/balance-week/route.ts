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
  updateWeekBalanceEnabled,
} from "@/lib/db";
import {
  getEffectiveBalanceWeekEnabled,
} from "@/lib/monthlyBalance";
import {
  getMonthlyBalanceContext,
  MonthlyBalanceContext,
} from "@/lib/monthlyBalanceServer";
import {
  assertBalanceWeekEditable,
  StatusError,
} from "@/lib/statusGuards";
import { WeekRow } from "@/lib/types";
import {
  balanceWeekSettingsSchema,
  weekStartSchema,
} from "@/lib/zodSchemas";

function forbiddenResponse() {
  return NextResponse.json(
    { error: "גישה זו מיועדת למנהל בלבד." },
    { status: 403 }
  );
}

function balanceWeekResponse(
  week: WeekRow,
  context: MonthlyBalanceContext,
  override = week.balance_week_enabled_override
) {
  return {
    weekStart: week.week_start,
    status: week.status,
    isBalanceWeek: context.isBalanceWeek,
    balanceMonthLabel: context.balanceMonthLabel,
    balanceWeekEnabledOverride: override,
    balanceWeekEnabled:
      getEffectiveBalanceWeekEnabled(
        context.isBalanceWeek,
        override
      ),
    hasDraftAssignments:
      week.status === "draft" &&
      context.hasCurrentAssignments,
  };
}

function rpcErrorMessage(
  error: unknown
): string | null {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  if (message.includes("WEEK_ALREADY_PUBLISHED")) {
    return "לא ניתן לשנות שבוע מאזן לאחר פרסום השבוע. יש לפתוח מחדש.";
  }

  if (message.includes("WEEK_NOT_FOUND")) {
    return "השבוע לא נמצא.";
  }

  return null;
}

export async function GET(
  request: NextRequest
) {
  const session = await getCurrentSession();

  if (!session || !isAdmin(session.role)) {
    return forbiddenResponse();
  }

  const parsedWeekStart =
    weekStartSchema.safeParse(
      request.nextUrl.searchParams.get(
        "weekStart"
      ) ?? ""
    );

  if (!parsedWeekStart.success) {
    return NextResponse.json(
      { error: "שבוע לא תקין." },
      { status: 400 }
    );
  }

  try {
    const week = await getOrCreateWeek(
      parsedWeekStart.data
    );
    const context =
      await getMonthlyBalanceContext(
        parsedWeekStart.data,
        week.balance_week_enabled_override
      );

    return NextResponse.json(
      balanceWeekResponse(week, context)
    );
  } catch (error) {
    console.error(
      "Failed to load balance-week setting:",
      error
    );
    return NextResponse.json(
      {
        error:
          "לא ניתן היה לטעון את הגדרת שבוע המאזן.",
      },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest
) {
  const session = await getCurrentSession();

  if (!session || !isAdmin(session.role)) {
    return forbiddenResponse();
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "בקשה לא תקינה." },
      { status: 400 }
    );
  }

  const parsed =
    balanceWeekSettingsSchema.safeParse(
      body
    );

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "הגדרת שבוע המאזן אינה תקינה.",
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  try {
    const week = await getOrCreateWeek(
      parsed.data.weekStart
    );
    assertBalanceWeekEditable(week.status);

    const context =
      await getMonthlyBalanceContext(
        parsed.data.weekStart,
        week.balance_week_enabled_override
      );

    if (!context.isBalanceWeek) {
      return NextResponse.json(
        { error: "השבוע הזה אינו שבוע מאזן." },
        { status: 409 }
      );
    }

    const override =
      await updateWeekBalanceEnabled(
        week.id,
        parsed.data.enabled
      );

    return NextResponse.json(
      balanceWeekResponse(
        week,
        context,
        override
      )
    );
  } catch (error) {
    if (error instanceof StatusError) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }

    const friendlyMessage =
      rpcErrorMessage(error);

    if (friendlyMessage) {
      return NextResponse.json(
        { error: friendlyMessage },
        { status: 409 }
      );
    }

    console.error(
      "Failed to update balance-week setting:",
      error
    );
    return NextResponse.json(
      {
        error:
          "לא ניתן היה לשמור את הגדרת שבוע המאזן.",
      },
      { status: 500 }
    );
  }
}

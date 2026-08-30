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
  updateWeekAlgorithmPriorities,
} from "@/lib/db";
import {
  assertAlgorithmPrioritiesEditable,
  StatusError,
} from "@/lib/statusGuards";
import {
  getEffectiveAlgorithmPriorities,
} from "@/lib/types";
import {
  algorithmPrioritySettingsSchema,
  weekStartSchema,
} from "@/lib/zodSchemas";

function forbiddenResponse() {
  return NextResponse.json(
    { error: "גישה זו מיועדת למנהל בלבד." },
    { status: 403 }
  );
}

function priorityResponse(
  week: Awaited<
    ReturnType<typeof getOrCreateWeek>
  >,
  priorities = week.algorithm_priorities
) {
  return {
    weekStart: week.week_start,
    status: week.status,
    priorities,
    effectivePriorities:
      getEffectiveAlgorithmPriorities(
        priorities
      ),
    isDefault: priorities === null,
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

  if (
    message.includes(
      "WEEK_ALREADY_PUBLISHED"
    )
  ) {
    return "לא ניתן לשנות תעדוף לאחר פרסום השבוע. יש לפתוח מחדש.";
  }

  if (
    message.includes("WEEK_NOT_FOUND")
  ) {
    return "השבוע לא נמצא.";
  }

  return null;
}

export async function GET(
  request: NextRequest
) {
  const session = await getCurrentSession();

  if (
    !session ||
    !isAdmin(session.role)
  ) {
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

    return NextResponse.json(
      priorityResponse(week)
    );
  } catch (error) {
    console.error(
      "Failed to load algorithm priorities:",
      error
    );
    return NextResponse.json(
      {
        error:
          "לא ניתן היה לטעון את תעדוף האלגוריתם.",
      },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest
) {
  const session = await getCurrentSession();

  if (
    !session ||
    !isAdmin(session.role)
  ) {
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
    algorithmPrioritySettingsSchema.safeParse(
      body
    );

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "סדר התעדוף אינו תקין.",
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  try {
    const week = await getOrCreateWeek(
      parsed.data.weekStart
    );

    assertAlgorithmPrioritiesEditable(
      week.status
    );

    const priorities =
      await updateWeekAlgorithmPriorities(
        week.id,
        parsed.data.priorities
      );

    return NextResponse.json(
      priorityResponse(week, priorities)
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
      "Failed to update algorithm priorities:",
      error
    );
    return NextResponse.json(
      {
        error:
          "לא ניתן היה לשמור את תעדוף האלגוריתם.",
      },
      { status: 500 }
    );
  }
}

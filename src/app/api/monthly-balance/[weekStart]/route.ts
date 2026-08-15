import {
  NextRequest,
  NextResponse,
} from "next/server";
import {
  getCurrentSession,
  isAdmin,
} from "@/lib/auth";
import { getMonthlyBalanceContext } from "@/lib/monthlyBalanceServer";

const WEEK_START_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json(
      { error: "נדרשת התחברות." },
      { status: 401 }
    );
  }

  const pathParts = request.nextUrl.pathname.split("/").filter(Boolean);
  const weekStart = pathParts[pathParts.length - 1] ?? "";

  if (!WEEK_START_PATTERN.test(weekStart)) {
    return NextResponse.json(
      { error: "תאריך השבוע אינו תקין." },
      { status: 400 }
    );
  }

  try {
    const context = await getMonthlyBalanceContext(weekStart);

    if (isAdmin(session.role)) {
      return NextResponse.json(context);
    }

    return NextResponse.json({
      isBalanceWeek: context.isBalanceWeek,
      balanceMonthLabel: context.balanceMonthLabel,
      hasCurrentAssignments: context.hasCurrentAssignments,
      currentWeekGapUnits: context.currentWeekGapUnits,
    });
  } catch (error) {
    console.error("Failed to load monthly balance context:", error);

    return NextResponse.json(
      { error: "לא ניתן היה לטעון את נתוני שבוע המאזן." },
      { status: 500 }
    );
  }
}

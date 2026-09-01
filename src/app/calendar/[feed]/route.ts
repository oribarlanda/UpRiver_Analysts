import { buildCalendarFeed, CalendarFeedAudience } from "@/lib/calendarFeed";
import { verifyCalendarFeedToken } from "@/lib/calendarFeedAccess";
import {
  getPublishedCalendarWeeks,
  isCalendarFeedEmployee,
} from "@/lib/calendarFeedServer";

export const dynamic = "force-dynamic";

function resolveAudience(feed: string): CalendarFeedAudience | null {
  const match = /^(hila|yaara|omer|admin)\.([A-Za-z0-9_-]+)\.ics$/.exec(feed);

  if (!match) return null;

  const name = match[1];
  const audience: CalendarFeedAudience = isCalendarFeedEmployee(name)
    ? name
    : "admin";

  return verifyCalendarFeedToken(audience, match[2]) ? audience : null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ feed: string }> }
) {
  const { feed } = await context.params;
  const audience = resolveAudience(feed);

  if (!audience) {
    return new Response("Calendar feed not found.", { status: 404 });
  }

  try {
    const weeks = await getPublishedCalendarWeeks();
    const calendar = buildCalendarFeed(weeks, audience);

    return new Response(calendar, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=900",
        "Content-Disposition": `inline; filename="upriver-${audience}.ics"`,
      },
    });
  } catch (error) {
    console.error("Failed to build calendar subscription feed", error);
    return new Response("Unable to build calendar feed.", { status: 500 });
  }
}

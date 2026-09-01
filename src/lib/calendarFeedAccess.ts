import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { CalendarFeedAudience } from "./calendarFeed";

function getCalendarFeedToken(audience: CalendarFeedAudience): string {
  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    throw new Error("Missing SESSION_SECRET environment variable.");
  }

  return createHmac("sha256", secret)
    .update(`calendar-feed:v1:${audience}`)
    .digest("base64url");
}

export function getCalendarFeedPath(audience: CalendarFeedAudience): string {
  return `/calendar/${audience}.${getCalendarFeedToken(audience)}.ics`;
}

export function verifyCalendarFeedToken(
  audience: CalendarFeedAudience,
  token: string
): boolean {
  const expected = getCalendarFeedToken(audience);
  const actualBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

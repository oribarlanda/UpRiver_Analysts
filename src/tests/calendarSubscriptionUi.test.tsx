import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CalendarSubscriptionCard, {
  CALENDAR_SUBSCRIPTION_STEPS,
} from "../components/CalendarSubscriptionCard";

describe("calendar subscription UI", () => {
  it("renders a compact mobile-first employee copy action and help button", () => {
    const markup = renderToStaticMarkup(
      createElement(CalendarSubscriptionCard, {
        feedPath: "/calendar/hila.signed-token.ics",
        title: "חיבור ליומן",
        description: "כל המשמרות שפורסמו עבורך",
        scope: "employee",
      })
    );

    expect(markup).toContain("חיבור ליומן");
    expect(markup).toContain("העתק קישור ליומן");
    expect(markup).toContain("איך מחברים את היומן?");
    expect(markup).toContain(">?</button>");
    expect(markup).toContain("/calendar/hila.signed-token.ics");
    expect(markup).toContain("min-h-11");
    expect(markup).toContain("sm:p-5");
  });

  it("renders the manager wording and an accurate whole-calendar color note", () => {
    const markup = renderToStaticMarkup(
      createElement(CalendarSubscriptionCard, {
        feedPath: "/calendar/admin.signed-token.ics",
        title: "יומן מנהל",
        description: "כל המשמרות של כל העובדות",
        scope: "admin",
      })
    );

    expect(markup).toContain("יומן מנהל");
    expect(markup).toContain("כל המשמרות של כל העובדות");
    expect(markup).toContain("צבע ליומן כולו");
    expect(markup).toContain("אינו נשמר באופן אמין");
  });

  it("keeps the complete one-time Google Calendar setup instructions", () => {
    expect(CALENDAR_SUBSCRIPTION_STEPS).toEqual([
      "פתחו את Google Calendar במחשב.",
      "ליד Other calendars / יומנים אחרים לחצו על +.",
      "בחרו From URL / מכתובת URL.",
      "הדביקו את הקישור שהועתק מהאתר.",
      "לחצו Add calendar.",
    ]);
  });
});

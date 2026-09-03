import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("notification reminder infrastructure", () => {
  it("configures one once-daily Hobby-compatible cron for every UTC hour", () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")
    ) as { crons: Array<{ path: string; schedule: string }> };

    expect(config.crons).toHaveLength(24);
    expect(config.crons.map((cron) => cron.schedule)).toEqual(
      Array.from({ length: 24 }, (_, hour) => `0 ${hour} * * *`)
    );
    expect(config.crons.every((cron) => cron.path.startsWith("/api/cron/notifications?slot="))).toBe(true);
  });

  it("stores day/hour reminders without adding shift reminders or Supabase cron", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/0009_employee_notification_preferences.sql"
      ),
      "utf8"
    );

    expect(migration).toContain("day_of_week");
    expect(migration).toContain("notification_delivery_log");
    expect(migration).toContain("reminder_time");
    expect(migration).not.toContain("pre_shift");
    expect(migration).not.toContain("pg_cron");
  });

  it("protects the cron endpoint with CRON_SECRET", () => {
    const route = readFileSync(
      resolve(process.cwd(), "src/app/api/cron/notifications/route.ts"),
      "utf8"
    );

    expect(route).toContain("process.env.CRON_SECRET");
    expect(route).toContain("authorization");
    expect(route).toContain("Bearer ${secret}");
  });
});

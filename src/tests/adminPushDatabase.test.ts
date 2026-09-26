import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

describe("admin approvals migration executed in PostgreSQL", () => {
  let db: PGlite;
  let week: string;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec("create role anon; create role authenticated; create role service_role;");
    const dir = resolve("supabase/migrations");
    for (const file of readdirSync(dir).filter(f => f.endsWith(".sql")).sort()) {
      // PGlite has core gen_random_uuid(); pgcrypto extension is not needed by these migrations.
      await db.exec(readFileSync(resolve(dir, file), "utf8").replace('create extension if not exists "pgcrypto";', ""));
    }
  }, 30000);
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    await db.exec("delete from weeks; update admin_notification_preferences set all_preferences_confirmed_enabled = true;");
    const result = await db.query<{id: string}>("insert into weeks(week_start) values('2026-09-20') returning id");
    week = result.rows[0].id;
    await db.query("insert into preferences(week_id,employee,day_index,shift_type,preference) values($1,'hila',0,'morning','can')", [week]);
  });
  const confirm = (employee: string) => db.query("select confirm_preferences($1,$2)", [week, employee]);
  async function claim() { return (await db.query<{claimed:boolean}>("select claim_admin_preferences_ready($1) as claimed", [week])).rows[0].claimed; }
  async function all() { for (const e of ["hila","yaara","omer"]) await confirm(e); }

  it("does not claim with zero, one or two confirmations; claims only once with all three", async () => {
    expect(await claim()).toBe(false);
    await confirm("hila"); expect(await claim()).toBe(false);
    await confirm("yaara"); expect(await claim()).toBe(false);
    await confirm("omer"); expect(await claim()).toBe(true);
    await confirm("omer"); expect(await claim()).toBe(false);
    await all(); expect(await claim()).toBe(false);
  });
  it("blocks dirty confirmations and permits a new claim after reconfirmation", async () => {
    await all(); expect(await claim()).toBe(true);
    await db.query("update preferences set preference='want' where week_id=$1", [week]);
    expect(await claim()).toBe(false);
    await confirm("yaara"); expect(await claim()).toBe(false);
    await confirm("hila"); expect(await claim()).toBe(true);
    expect(await claim()).toBe(false);
  });
  it("a no-op UPSERT neither invalidates approval nor causes a duplicate", async () => {
    await all(); expect(await claim()).toBe(true);
    await db.query("insert into preferences(week_id,employee,day_index,shift_type,preference) values($1,'hila',0,'morning','can') on conflict(week_id,employee,day_index,shift_type) do update set preference=excluded.preference", [week]);
    const result = await db.query<{changed_since_confirmation:boolean}>("select changed_since_confirmation from preference_confirmations where week_id=$1 and employee='hila'",[week]);
    expect(result.rows[0].changed_since_confirmation).toBe(false);
    await confirm("hila"); expect(await claim()).toBe(false);
  });
  it("edit then revert still requires approval and allows one new delivery", async () => {
    await all(); await claim();
    await db.query("update preferences set preference='want' where week_id=$1", [week]);
    await db.query("update preferences set preference='can' where week_id=$1", [week]);
    expect(await claim()).toBe(false);
    await confirm("hila"); expect(await claim()).toBe(true);
  });
  it("supports the existing structure-change invalidation signal", async () => {
    await all(); await claim();
    await db.query("update preference_confirmations set changed_since_confirmation=true where week_id=$1", [week]);
    expect(await claim()).toBe(false);
    await all(); expect(await claim()).toBe(true);
  });
  it("does not notify when disabled or closed; rejects confirmation after closure", async () => {
    await all();
    await db.exec("update admin_notification_preferences set all_preferences_confirmed_enabled=false");
    expect(await claim()).toBe(false);
    await db.exec("update admin_notification_preferences set all_preferences_confirmed_enabled=true");
    expect(await claim()).toBe(true);
    await db.query("update weeks set status='draft' where id=$1",[week]);
    expect(await claim()).toBe(false);
    await expect(confirm("hila")).rejects.toThrow("WEEK_NOT_OPEN");
  });
  it("concurrent delivery claim requests have one winner", async () => {
    await all();
    const results = await Promise.all([claim(),claim(),claim()]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

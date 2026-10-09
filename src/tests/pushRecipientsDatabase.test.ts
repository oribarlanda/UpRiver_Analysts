import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("push recipient migration preserves subscriptions in PostgreSQL", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec("create role anon; create role authenticated; create role service_role;");
    for (const file of readdirSync(resolve("supabase/migrations")).filter(f=>f.endsWith(".sql")).sort()) {
      if (file.startsWith("0011")) {
        await db.exec("insert into push_subscriptions(employee,endpoint,p256dh,auth) values('hila','https://push/shared','key','auth')");
      }
      await db.exec(readFileSync(resolve("supabase/migrations",file),"utf8").replace('create extension if not exists "pgcrypto";',""));
    }
  },30000);
  afterAll(async()=>{await db?.close();});
  async function save(role:string, subscribe:boolean) {
    return (await db.query<{active:boolean}>("select save_push_subscription($1,'https://push/shared','key','auth',null,$2) as active",[role,subscribe])).rows[0].active;
  }
  it("backfills the existing role and does not add admin merely on a visit",async()=>{
    expect(await save("hila",false)).toBe(true);
    expect(await save("admin",false)).toBe(false);
    expect((await db.query("select * from push_subscription_recipients")).rows).toHaveLength(1);
  });
  it("explicit admin opt-in preserves the employee, is idempotent and keeps keys",async()=>{
    expect(await save("admin",true)).toBe(true);
    expect(await save("admin",true)).toBe(true);
    expect((await db.query("select employee from push_subscription_recipients order by employee")).rows).toEqual([{employee:"admin"},{employee:"hila"}]);
    expect((await db.query("select employee,p256dh,auth from push_subscriptions")).rows).toEqual([{employee:"hila",p256dh:"key",auth:"auth"}]);
  });
  it("role opt-out cannot remove another role; passive refresh cannot re-enable it",async()=>{
    await db.exec("delete from push_subscription_recipients where employee='hila'");
    expect(await save("hila",false)).toBe(false);
    expect(await save("admin",false)).toBe(true);
    expect((await db.query("select * from push_subscriptions")).rows).toHaveLength(1);
  });
  it("removing an expired endpoint cleans every associated role",async()=>{
    await db.exec("delete from push_subscriptions where endpoint='https://push/shared'");
    expect((await db.query("select * from push_subscription_recipients")).rows).toHaveLength(0);
  });
  it("rejects public RPC access and keeps RLS enabled",async()=>{
    const result=await db.query<{allowed:boolean}>("select has_function_privilege('anon','save_push_subscription(text,text,text,text,text,boolean)','EXECUTE') as allowed");
    expect(result.rows[0].allowed).toBe(false);
    expect((await db.query<{relrowsecurity:boolean}>("select relrowsecurity from pg_class where relname='push_subscription_recipients'")).rows[0].relrowsecurity).toBe(true);
  });
});

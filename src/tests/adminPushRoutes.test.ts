import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  session: {role:"admin"} as {role:string}|null,
  rpc:vi.fn(), upsert:vi.fn(), single:vi.fn(), subscribe:vi.fn(), remove:vi.fn(), send:vi.fn(),
}));
vi.mock("../lib/auth",()=>({getCurrentSession:async()=>mocks.session,isAdmin:(role:string)=>role==="admin"}));
vi.mock("../lib/db",()=>({getOrCreateWeek:async()=>({id:"week-id",status:"open"})}));
vi.mock("../lib/pushServer",()=>({sendPushNotifications:mocks.send}));
vi.mock("../lib/pushRepository",()=>({pushRepository:{upsertForEmployee:mocks.subscribe,deleteForEmployee:mocks.remove}}));
vi.mock("../lib/supabaseServer",()=>({getSupabaseServerClient:()=>({
  rpc:mocks.rpc,from:()=>({upsert:mocks.upsert,select:()=>({eq:()=>({single:mocks.single})})}),
})}));
import {POST as subscribe} from "../app/api/push/subscription/route";
import {GET, PUT} from "../app/api/admin/notifications/route";
import {POST as confirm} from "../app/api/preferences/confirmation/route";
function req(url:string,body:unknown,method="POST"){
 return new NextRequest("http://localhost"+url,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
}
beforeEach(()=>{
 vi.clearAllMocks(); mocks.session={role:"admin"};
 mocks.subscribe.mockResolvedValue(true);
 mocks.upsert.mockResolvedValue({error:null});
 mocks.single.mockResolvedValue({data:{all_preferences_confirmed_enabled:true},error:null});
 mocks.rpc.mockImplementation(async (name:string)=>({data:name==="claim_admin_preferences_ready"?true:{employee:"hila",changed_since_confirmation:false},error:null}));
 mocks.send.mockResolvedValue(undefined);
});
describe("admin notification endpoints",()=>{
 it("derives subscription owner from the admin session",async()=>{
  const response=await subscribe(req("/api/push/subscription",{endpoint:"https://fcm.googleapis.com/fcm/send/test",keys:{p256dh:"a".repeat(87),auth:"b".repeat(22)}}));
  expect(response.status).toBe(200);
  expect(mocks.subscribe).toHaveBeenCalledWith("admin",expect.anything(),null,true);
 });
 it("passive inspection cannot enroll the current role",async()=>{
  mocks.subscribe.mockResolvedValue(false);
  const response=await subscribe(req("/api/push/subscription",{mode:"inspect",endpoint:"https://fcm.googleapis.com/fcm/send/test",keys:{p256dh:"a".repeat(87),auth:"b".repeat(22)}}));
  expect(await response.json()).toEqual({ok:true,active:false});
  expect(mocks.subscribe).toHaveBeenCalledWith("admin",expect.anything(),null,false);
 });
 it("loads and saves the single admin choice",async()=>{
  expect(await (await GET()).json()).toEqual({enabled:true});
  expect((await PUT(req("/api/admin/notifications",{enabled:false},"PUT"))).status).toBe(200);
  expect(mocks.upsert).toHaveBeenCalledWith({role:"admin",all_preferences_confirmed_enabled:false});
 });
 it("rejects non-admin settings writes and malformed values",async()=>{
  mocks.session={role:"hila"}; expect((await GET()).status).toBe(403);
  expect((await PUT(req("/api/admin/notifications",{enabled:true},"PUT"))).status).toBe(403);
  mocks.session=null; expect((await GET()).status).toBe(401);
  mocks.session={role:"admin"}; expect((await PUT(req("/api/admin/notifications",{enabled:"yes"},"PUT"))).status).toBe(400);
  expect(mocks.upsert).not.toHaveBeenCalled();
 });
 it("checks approvals server-side after saving and targets that week",async()=>{
  mocks.session={role:"hila"};
  expect((await confirm(req("/api/preferences/confirmation",{weekStart:"2026-09-20"}))).status).toBe(200);
  expect(mocks.rpc.mock.calls.map(c=>c[0])).toEqual(["confirm_preferences","claim_admin_preferences_ready"]);
  expect(mocks.send).toHaveBeenCalledWith(["admin"],expect.objectContaining({url:"/admin/2026-09-20"}));
 });
 it("preserves successful confirmation when delivery fails",async()=>{
  mocks.session={role:"hila"}; mocks.send.mockRejectedValue(new Error("push failure"));
  const log=vi.spyOn(console,"error").mockImplementation(()=>{});
  expect((await confirm(req("/api/preferences/confirmation",{weekStart:"2026-09-20"}))).status).toBe(200);
  log.mockRestore();
 });
});

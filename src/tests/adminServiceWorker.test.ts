import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { buildAllPreferencesConfirmedPayload } from "../lib/adminPushEvents";

describe("admin notification service worker",()=>{
 it.each([true,false])("opens the exact admin week (existing window: %s)",async existing=>{
  const handlers:Record<string,(e:unknown)=>void>={};
  const showNotification=vi.fn().mockResolvedValue(undefined);
  const navigate=vi.fn().mockResolvedValue(undefined),focus=vi.fn(),openWindow=vi.fn();
  runInNewContext(readFileSync("public/sw.js","utf8"),{URL,self:{
   addEventListener:(name:string,handler:(e:unknown)=>void)=>{handlers[name]=handler;},
   location:{origin:"https://upriver.test"},registration:{showNotification},
   clients:{matchAll:async()=>existing?[{navigate,focus}]:[],openWindow},
  }});
  let pending=Promise.resolve();
  const waitUntil=(promise:Promise<void>)=>{pending=promise;};
  const payload=buildAllPreferencesConfirmedPayload("2026-09-20");
  handlers.push({data:{json:()=>payload},waitUntil}); await pending;
  expect(showNotification).toHaveBeenCalledWith("UpRiver",expect.objectContaining({body:payload.body,data:{url:"/admin/2026-09-20"}}));
  handlers.notificationclick({notification:{close:vi.fn(),data:showNotification.mock.calls[0][1].data},waitUntil});
  await pending;
  expect(existing?navigate:openWindow).toHaveBeenCalledWith("https://upriver.test/admin/2026-09-20");
  if(existing)expect(focus).toHaveBeenCalledOnce();
 });
});

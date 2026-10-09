import { createECDH, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import webPush from "web-push";
import { describe, expect, it, vi } from "vitest";
import { deliverPushNotifications } from "../lib/pushDeliveryCore";
import { buildSchedulePublishedPayload, buildScheduleUpdatedPayload } from "../lib/pushEvents";
import { buildAllPreferencesConfirmedPayload } from "../lib/adminPushEvents";
import type { PushNotificationPayload } from "../lib/pushTypes";

const require = createRequire(import.meta.url);
// Decode with the receiver's private key, as the browser does.
const ece = require(require.resolve("http_ece", {paths:[require.resolve("web-push")]})) as {
  decrypt(body:Buffer, options:{version:string;privateKey:ReturnType<typeof createECDH>;authSecret:string}):Buffer;
};
const weekStart="2026-10-04";
const payloads:PushNotificationPayload[]=[buildSchedulePublishedPayload(weekStart),buildScheduleUpdatedPayload(weekStart),
 {title:"UpRiver",body:"תזכורת למלא ולאשר את ההעדפות לשבוע הבא 📋",type:"preference_reminder",url:"/week/"+weekStart,weekStart},
 buildAllPreferencesConfirmedPayload(weekStart)];

describe("encrypted Push to service-worker notification with no app window",()=>{
 it.each(payloads)("decrypts and displays $type and opens the correct deep link",async payload=>{
  const receiver=createECDH("prime256v1"); receiver.generateKeys();
  const auth=randomBytes(16).toString("base64url");
  const keys={p256dh:receiver.getPublicKey().toString("base64url"),auth};
  const vapid=webPush.generateVAPIDKeys();
  const role=payload.type==="all_preferences_confirmed"?"admin" as const:"hila" as const;
  const device={employee:role,endpoint:"https://push.test/device",...keys};
  const handlers:Record<string,(event:unknown)=>void>={};
  const showNotification=vi.fn<(title:string, options:{data:{url:string}})=>Promise<void>>().mockResolvedValue(undefined),openWindow=vi.fn(async()=>{});
  const claim=vi.fn(async()=>{}),skipWaiting=vi.fn(async()=>{});
  runInNewContext(readFileSync("public/sw.js","utf8"),{URL,self:{location:{origin:"https://upriver.test"},
   addEventListener:(type:string,handler:(event:unknown)=>void)=>{handlers[type]=handler;},
   registration:{showNotification},skipWaiting,clients:{claim,matchAll:async()=>[],openWindow}}});
  let pending=Promise.resolve(); const waitUntil=(promise:Promise<void>)=>{pending=promise;};
  handlers.install({waitUntil});await pending;expect(skipWaiting).toHaveBeenCalledOnce();
  handlers.activate({waitUntil});await pending;expect(claim).toHaveBeenCalledOnce();
  const result=await deliverPushNotifications([role],payload,{
   listForEmployees:async()=>[device],markSuccess:async()=>{},markFailure:async()=>{},deleteByEndpoint:async()=>{},
  },{send:async(subscription,notification)=>{
   const request=webPush.generateRequestDetails({endpoint:subscription.endpoint,keys},JSON.stringify(notification),{
    vapidDetails:{subject:"mailto:test@upriver.test",...vapid},TTL:86400});
   expect(request.headers.Authorization).toContain("vapid t=");
   expect(request.headers["Content-Encoding"]).toBe("aes128gcm");
   const decoded=JSON.parse(ece.decrypt(request.body as Buffer,{version:"aes128gcm",privateKey:receiver,authSecret:auth}).toString());
   expect(decoded).toEqual(payload);
   handlers.push({data:{json:()=>decoded},waitUntil}); await pending;
  }},vi.fn());
  expect(result).toMatchObject({delivered:1,failed:0});
  expect(showNotification).toHaveBeenCalledWith("UpRiver",expect.objectContaining({body:payload.body,
   icon:"/icons/upriver-192.png",badge:"/icons/notification-badge.png",renotify:true,data:{url:payload.url}}));
  handlers.notificationclick({notification:{close:vi.fn(),data:showNotification.mock.calls[0][1].data},waitUntil});
  await pending;expect(openWindow).toHaveBeenCalledWith("https://upriver.test"+payload.url);
 });
});

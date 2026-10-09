import { describe, expect, it, vi } from "vitest";
import { deliverPushNotifications } from "../lib/pushDeliveryCore";
import { buildSchedulePublishedPayload } from "../lib/pushEvents";

const device = {employee:"hila" as const,endpoint:"https://push/secret",p256dh:"secret-key",auth:"secret-auth"};
function repository() {return {listForEmployees:vi.fn(async()=>[device]),markSuccess:vi.fn(async()=>{}),markFailure:vi.fn(async()=>{}),deleteByEndpoint:vi.fn(async()=>{})};}
describe("push delivery diagnostics and device isolation",()=>{
 it("sends once per endpoint even when several roles share a device",async()=>{
  const repo=repository(); repo.listForEmployees.mockResolvedValue([device,device]);
  const send=vi.fn(async()=>{});
  expect(await deliverPushNotifications(["hila"],buildSchedulePublishedPayload("2026-10-04"),repo,{send},vi.fn())).toMatchObject({attempted:1,delivered:1});
  expect(send).toHaveBeenCalledOnce();
 });
 it("a DB bookkeeping error does not disguise transport acceptance",async()=>{
  const repo=repository();repo.markSuccess.mockRejectedValue(new Error("db unavailable"));
  const log=vi.fn();
  expect(await deliverPushNotifications(["hila"],buildSchedulePublishedPayload("2026-10-04"),repo,{send:async()=>{}},log)).toMatchObject({delivered:1,failed:0});
  expect(repo.markFailure).not.toHaveBeenCalled();
  expect(log).toHaveBeenCalledWith("[push] bookkeeping_failed",expect.anything());
 });
 it("reports status codes without leaking endpoint or keys, even if DB also fails",async()=>{
  const repo=repository();repo.markFailure.mockRejectedValue(new Error("db unavailable"));
  const log=vi.fn();
  expect(await deliverPushNotifications(["hila"],buildSchedulePublishedPayload("2026-10-04"),repo,{send:async()=>{throw {statusCode:403,body:"secret",endpoint:device.endpoint};}},log)).toMatchObject({delivered:0,failed:1});
  expect(log).toHaveBeenCalledWith("[push] transport_failed",expect.objectContaining({statusCode:403}));
  expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
 });
});

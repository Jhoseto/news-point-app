import { describe,it,expect } from "vitest";
import { assessCollector,notificationDecision,submitMail } from "../deploy/np2/city-monitor.mjs";
const now=Date.parse("2026-10-26T16:00:00Z");
const health=()=>({version:1,checkedAt:new Date(now-60000).toISOString(),status:"ok",expectedSources:2,healthySources:2,sources:[{id:"water",status:"healthy"},{id:"air",status:"healthy"}]});
describe("independent city watchdog",()=>{
 it("detects a stopped schedule without reusing old success",()=>{expect(assessCollector({...health(),checkedAt:new Date(now-11*60000).toISOString()},{},now).status).toBe("stopped")});
 it("allows a bounded active cycle but catches a hung one",()=>{const h={...health(),checkedAt:new Date(now-30*60000).toISOString()};expect(assessCollector(h,{started:(now-60000)/1000,finished:0},now).status).toBe("collecting");expect(assessCollector(h,{started:(now-22*60000)/1000,finished:0},now).status).toBe("stopped")});
 it("does not hide a failed completed cycle",()=>{const h={...health(),status:"degraded",healthySources:1,sources:[{id:"water",status:"failed"},{id:"air",status:"healthy"}]};expect(assessCollector(h,{started:(now-60000)/1000,finished:now/1000},now)).toEqual({status:"degraded",problems:["water:failed"]})});
 it("sends on a new problem or recovery, not on unchanged polls",()=>{const bad={status:"degraded",problems:["water:failed"]};const first=notificationDecision(bad,null)!;expect(first.alerting).toBe(true);expect(notificationDecision(bad,first)).toBeNull();expect(notificationDecision({status:"ok",problems:[]},first)?.alerting).toBe(false);expect(notificationDecision({status:"ok",problems:[]},null)).toBeNull()});
 it("catches a newly failing source and rejects inconsistent reports",()=>{const prior=notificationDecision({status:"degraded",problems:["water:failed"]},null);expect(notificationDecision({status:"degraded",problems:["air:failed","water:failed"]},prior)).not.toBeNull();expect(assessCollector({...health(),sources:[{id:"water",status:"healthy"},{id:"water",status:"healthy"}]},{},now).status).toBe("unavailable");expect(assessCollector({...health(),healthySources:1},{},now).status).toBe("unavailable")});
 it("keeps pending startup quiet and invalid/missing data actionable",()=>{expect(notificationDecision({status:"collecting",problems:[]},null)).toBeNull();expect(assessCollector(null,{},now).status).toBe("unavailable")});
 it("rejects injected mail headers before invoking the transport",async()=>{
  const message={to:"support@example.com",from:"alerts@example.com",subject:"City alert",text:"A source failed"};
  for(const bad of [{to:"support@example.com\r\nBcc: other@example.com"},{from:"alerts@example.com\nCc: other@example.com"},{subject:"City alert\r\nBcc: other@example.com"}]){
   await expect(submitMail({...message,...bad},"/transport-must-not-run")).rejects.toThrow("Invalid city alert mail configuration");
  }
 });
});

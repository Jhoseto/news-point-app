import{describe,it,expect}from"vitest";import{cityRoadRestrictions}from"./road-restrictions";
const now=Date.parse("2026-10-26T12:00:00Z");const row={id:"road",category:8,categoryLabel:"Затворен път",description:"Затворен участък",from:"бул. Руски",to:null,startTime:null,endTime:null,delaySec:null,position:{lat:42.14,lon:24.74},path:null};
const data=(incidents:unknown[])=>({status:"ok",fetchedAt:"2026-10-26T11:59:00Z",expiresAt:"2026-10-26T12:29:00Z",payload:{incidents}});
describe('city road restrictions',()=>{
 it('includes only city closures, lanes and works, with no duplicate rows',()=>{const result=cityRoadRestrictions(data([row,row,{...row,id:"jam",category:6},{...row,id:"outside",position:{lat:42.21,lon:24.74}}]),now);expect(result.items.map(x=>x.id)).toEqual(['road'])});
 it('hides stale, failed, expired and malformed responses',()=>{for(const input of [null,{...data([row]),status:'stale'},{...data([row]),expiresAt:'2026-10-26T11:59:00Z'},{...data([row]),fetchedAt:'tomorrow'}])expect(cityRoadRestrictions(input,now).items).toEqual([])});
 it('expires ended restrictions and excludes future starts',()=>{expect(cityRoadRestrictions(data([{...row,endTime:'2026-10-25T12:00:00Z'},{...row,id:'future',startTime:'2026-10-27T12:00:00Z'}]),now).items).toEqual([])});
 it('keeps a valid empty response distinct from a failed source',()=>{expect(cityRoadRestrictions(data([]),now).status).toBe('ok');expect(cityRoadRestrictions({},now).status).toBe('unavailable')});
});

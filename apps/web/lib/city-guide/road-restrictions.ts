import { z } from "zod";
const point=z.object({lat:z.number().finite(),lon:z.number().finite()});
const incident=z.object({id:z.string().min(1).max(500),category:z.number().int(),categoryLabel:z.string().max(150),description:z.string().max(2000),from:z.string().nullable(),to:z.string().nullable(),startTime:z.string().nullable(),endTime:z.string().nullable(),delaySec:z.number().nullable(),position:point.nullable(),path:z.array(point).max(200).nullable()});
const envelope=z.object({status:z.string(),fetchedAt:z.string().nullable(),expiresAt:z.string().nullable(),payload:z.object({incidents:z.array(incident).max(2000)}).nullable()});
export type CityRoadIncident=z.infer<typeof incident>;
export function cityRoadRestrictions(input:unknown,now=Date.now()):{status:"ok"|"unavailable";checkedAt:string|null;items:CityRoadIncident[]}{
 const parsed=envelope.safeParse(input);if(!parsed.success)return{status:"unavailable",checkedAt:null,items:[]};const d=parsed.data;
 const fetched=Date.parse(d.fetchedAt??""),expiry=Date.parse(d.expiresAt??"");
 if(d.status!=="ok"||!d.payload||!Number.isFinite(fetched)||fetched>now||now-fetched>35*60000||!Number.isFinite(expiry)||expiry<=now)return{status:"unavailable",checkedAt:d.fetchedAt,items:[]};
 const inCity=(p:z.infer<typeof point>)=>p.lat>=42.10&&p.lat<=42.19&&p.lon>=24.68&&p.lon<=24.82;
 const items=d.payload.incidents.filter(x=>[7,8,9].includes(x.category)&&(x.position&&inCity(x.position)||x.path?.some(inCity))
  &&(!x.endTime||Number.isFinite(Date.parse(x.endTime))&&Date.parse(x.endTime)>now)&&(!x.startTime||Number.isFinite(Date.parse(x.startTime))&&Date.parse(x.startTime)<=now));
 return{status:"ok",checkedAt:d.fetchedAt,items:[...new Map(items.map(i=>[i.id,i])).values()]};
}

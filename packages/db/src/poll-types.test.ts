import { describe,it,expect } from "vitest";
import { isPollOpen,pollInput,pollCorrection,pollResult,type Poll } from "./poll-types";
const a="00000000-0000-4000-8000-000000000001",b="00000000-0000-4000-8000-000000000002",c="00000000-0000-4000-8000-000000000003";
const poll:Poll={id:a,question:"Тестов въпрос?",description:"",options:[{id:a,label:"Първи"},{id:b,label:"Втори"},{id:c,label:"Трети"}],status:"open",featured:true,startsAt:null,endsAt:null,version:1,adjustments:{},createdAt:"2026-09-27T00:00:00.000Z"};
const input=()=>{const {adjustments,createdAt,...rest}=poll;return rest;};
describe("poll editorial validation",()=>{
  it("accepts a bounded valid poll",()=>expect(pollInput.safeParse(input()).success).toBe(true));
  it.each([1,7])("rejects %i answers",n=>expect(pollInput.safeParse({...input(),options:Array.from({length:n},(_,i)=>({id:crypto.randomUUID(),label:`Отговор ${i}`}))}).success).toBe(false));
  it("rejects duplicate options independent of case/whitespace",()=>expect(pollInput.safeParse({...input(),options:[{id:a,label:" Да "},{id:b,label:"да"}]}).success).toBe(false));
  it("rejects repeated option IDs",()=>expect(pollInput.safeParse({...input(),options:[{id:a,label:"Да"},{id:a,label:"Не"}]}).success).toBe(false));
  it("rejects invalid schedule and featured drafts",()=>{expect(pollInput.safeParse({...input(),startsAt:"2026-10-01T00:00:00Z",endsAt:"2026-09-01T00:00:00Z"}).success).toBe(false);expect(pollInput.safeParse({...input(),status:"draft"}).success).toBe(false);});
  it("does not accept real counts or hidden adjustment fields in ordinary saves",()=>expect(pollInput.safeParse({...input(),adjustments:{[a]:90}}).success).toBe(false));
  it("accepts integer bounded deltas without a manual reason field",()=>{expect(pollCorrection.safeParse({id:a,version:1,deltas:{[a]:-3}}).success).toBe(true);expect(pollCorrection.safeParse({id:a,version:1,deltas:{[a]:1.5}}).success).toBe(false);expect(pollCorrection.safeParse({id:a,version:1,reason:"скрито поле",deltas:{[a]:0}}).success).toBe(false);});
});
describe("poll lifecycle and honest results",()=>{
  it("ends at the exact deadline",()=>expect(isPollOpen({...poll,endsAt:"2026-09-27T12:00:00Z"},Date.parse("2026-09-27T12:00:00Z"))).toBe(false));
  it("does not open future/draft/archived polls",()=>{expect(isPollOpen({...poll,startsAt:"2027-01-01T00:00:00Z"},0)).toBe(false);expect(isPollOpen({...poll,status:"draft"})).toBe(false);expect(isPollOpen({...poll,status:"archived"})).toBe(false);});
  it("allocates rounding to exactly 100%, including equal thirds",()=>{const r=pollResult(poll,{[a]:1,[b]:1,[c]:1});expect(r.options.map(o=>o.percent)).toEqual([34,33,33]);expect(r.total).toBe(3);});
  it("handles no votes without invented percentages",()=>expect(pollResult(poll,{}).options.every(o=>o.count===0&&o.percent===0)).toBe(true));
  it("keeps source counts untouched and labels corrections",()=>{const real={[a]:4,[b]:6};const r=pollResult({...poll,adjustments:{[a]:-2,[b]:5}},real);expect(real).toEqual({[a]:4,[b]:6});expect(r.total).toBe(13);expect(r.adjusted).toBe(true);expect(r.options.reduce((s,o)=>s+o.percent,0)).toBe(100);});
});

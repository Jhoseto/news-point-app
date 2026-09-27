import { beforeEach,it,expect,vi } from "vitest";
vi.mock("server-only",()=>({}));
const db=vi.hoisted(()=>({execute:vi.fn(),transaction:vi.fn()}));
vi.mock("./index",()=>({getDb:()=>db}));
import { correctPoll,savePoll,voteInPoll } from "./polls";
import type { Poll } from "./poll-types";
const id="00000000-0000-4000-8000-000000000001",option="00000000-0000-4000-8000-000000000002";
const p:Poll={id,question:"Тестов въпрос?",description:"",options:[{id:option,label:"Да"},{id,label:"Не"}],status:"open",featured:false,startsAt:null,endsAt:null,version:1,adjustments:{},createdAt:new Date().toISOString()};
const actor={id:"editor",name:"Тестов редактор",role:"editor"};
beforeEach(()=>{vi.resetAllMocks();db.transaction.mockImplementation(fn=>fn(db));});
it("rejects a second vote before inserting",async()=>{
  db.execute.mockResolvedValueOnce([p]).mockResolvedValueOnce([{exists:1}]);
  await expect(voteInPoll(id,option,"voter","ip")).rejects.toMatchObject({code:"already_voted",status:409});
  expect(db.execute).toHaveBeenCalledTimes(2);
});
it("rejects the fourth successful vote from an IP",async()=>{
  db.execute.mockResolvedValueOnce([p]).mockResolvedValueOnce([]).mockResolvedValueOnce([{n:3}]);
  await expect(voteInPoll(id,option,"new-voter","ip")).rejects.toMatchObject({code:"ip_limit",status:429});
  expect(db.execute).toHaveBeenCalledTimes(3);
});
it("accepts the third IP vote and returns its selected option",async()=>{
  db.execute.mockResolvedValueOnce([p]).mockResolvedValueOnce([]).mockResolvedValueOnce([{n:2}]).mockResolvedValueOnce([]).mockResolvedValueOnce([p]).mockResolvedValueOnce([{option_id:option}]).mockResolvedValueOnce([{option_id:option,count:3}]);
  const result=await voteInPoll(id,option,"new-voter","ip");expect(result.votedOption).toBe(option);expect(result.poll.total).toBe(3);expect(db.transaction).toHaveBeenCalledOnce();
});
it.each(["closed","draft","archived"])("rejects voting in %s polls",async status=>{
  db.execute.mockResolvedValueOnce([{...p,status}]);await expect(voteInPoll(id,option,"voter","ip")).rejects.toMatchObject({code:"closed"});expect(db.execute).toHaveBeenCalledOnce();
});
it("rejects options from another poll",async()=>{db.execute.mockResolvedValueOnce([p]);await expect(voteInPoll(id,crypto.randomUUID(),"voter","ip")).rejects.toMatchObject({code:"option"});});
it("does not give editors correction rights",async()=>{await expect(correctPoll({},actor)).rejects.toMatchObject({status:403});expect(db.transaction).not.toHaveBeenCalled();});
it("rejects negative resulting counts and unknown options",async()=>{
  const admin={...actor,role:"admin"};db.execute.mockResolvedValueOnce([p]).mockResolvedValueOnce([{option_id:option,count:2}]);
  await expect(correctPoll({id,version:1,deltas:{[option]:-3}},admin)).rejects.toMatchObject({code:"invalid_counts"});
});
it("detects concurrent editorial changes before writing",async()=>{
  const {adjustments,createdAt,...input}=p;db.execute.mockResolvedValueOnce([]).mockResolvedValueOnce([{...p,version:2}]);
  await expect(savePoll(input,actor)).rejects.toMatchObject({code:"conflict"});expect(db.execute).toHaveBeenCalledTimes(2);
});
it("locks question meaning after the first vote",async()=>{
  const {adjustments,createdAt,...input}=p;db.execute.mockResolvedValueOnce([]).mockResolvedValueOnce([p]).mockResolvedValueOnce([{exists:1}]);
  await expect(savePoll({...input,question:"Променен въпрос?"},actor)).rejects.toMatchObject({code:"locked"});
});
it("allows closing a voted poll despite JSONB object key order",async()=>{
  const {adjustments,createdAt,...input}=p;
  db.execute.mockResolvedValueOnce([]).mockResolvedValueOnce([{...p,options:p.options.map(o=>({label:o.label,id:o.id}))}]).mockResolvedValueOnce([{exists:1}]).mockResolvedValueOnce([{...p,status:"closed",version:2}]).mockResolvedValueOnce([]);
  expect((await savePoll({...input,status:"closed"},actor)).status).toBe("closed");expect(db.execute).toHaveBeenCalledTimes(5);
});
it("records corrections separately with an audit snapshot",async()=>{
  db.execute.mockResolvedValueOnce([p]).mockResolvedValueOnce([{option_id:option,count:2}]).mockResolvedValueOnce([{...p,version:2,adjustments:{[option]:-1}}]).mockResolvedValueOnce([]);
  const result=await correctPoll({id,version:1,deltas:{[option]:-1}},{...actor,role:"admin"});
  expect(result.adjustments[option]).toBe(-1);expect(db.execute).toHaveBeenCalledTimes(4);
});

import {describe,it,expect} from "vitest";
import {smartChoices} from "./reader-flow";
import type {SmartTurn} from "@newspoint/content/smart";

const roots=["First root question","Second root question","Third root question"].map((text,i)=>({id:`r${i}`,text}));
function turn(question:string,followUps:string[],nodeKey?:string){return {id:question,question,status:"completed",cached:false,nodeKey,answer:{status:"answered",blocks:[],sources:[],followUps:followUps.map((text,i)=>({id:`${question}-${i}`,text})),checkedAt:"",expiresAt:""}} as SmartTurn&{nodeKey?:string};}
describe("persistent Smart suggestions",()=>{
  it("retains two unchosen roots and adds a continuation with its actual public parent",()=>{
    const tray=smartChoices(roots,[turn(roots[0]!.text,["A fresh continuation"],"node-one")]);
    expect(tray.map(q=>q.text)).toEqual([roots[1]!.text,roots[2]!.text,"A fresh continuation"]);
    expect(tray[0]).toMatchObject({public:true});expect(tray[0]?.parentKey).toBeUndefined();
    expect(tray[2]).toMatchObject({public:true,parentKey:"node-one"});
  });
  it("replenishes after a second root while preserving an older follow-up's lineage",()=>{
    const tray=smartChoices(roots,[turn(roots[0]!.text,["First continuation"],"one"),turn(roots[1]!.text,["Second continuation"],"two")]);
    expect(tray.map(q=>q.text)).toEqual([roots[2]!.text,"First continuation","Second continuation"]);
    expect(tray[1]?.parentKey).toBe("one");expect(tray[2]?.parentKey).toBe("two");
  });
  it("keeps custom continuations private and introduces one without replacing all roots",()=>{
    const tray=smartChoices(roots,[turn("My custom question",["Private continuation"])]);
    expect(tray.map(q=>q.text)).toEqual([roots[0]!.text,roots[1]!.text,"Private continuation"]);
    expect(tray[2]).toMatchObject({public:false});expect(tray[2]?.parentKey).toBeUndefined();
  });
  it("does not replenish from pending or failed turns, and never repeats an asked question",()=>{
    const pending={...turn(roots[0]!.text,[]),status:"pending" as const,answer:null};
    expect(smartChoices(roots,[pending]).map(q=>q.text)).toEqual(roots.slice(1).map(q=>q.text));
    expect(smartChoices(roots,[{...pending,status:"failed"}])).toHaveLength(3);
    expect(smartChoices(roots,[turn(roots[0]!.text,[roots[0]!.text,roots[1]!.text,"Fresh choice"])])).toHaveLength(3);
  });
});

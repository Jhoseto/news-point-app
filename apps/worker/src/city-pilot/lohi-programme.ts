import { createHash } from "node:crypto";
import { DomUtils as D, parseDocument } from "htmlparser2";
import type { PilotSnapshot } from "./parse";
export const LOHI_URL="https://www.lohicraftspace.com/";
export function parseLoHi(html:string,now=new Date()):PilotSnapshot{
 const root=parseDocument(html),cards=D.getElementsByTagName("article",root).filter(n=>n.attribs.class?.split(/\s/u).includes("event"));
 if(!cards.length||cards.length>100)throw new Error("Lo/Hi: event card structure missing");
 const text=D.textContent(root).replace(/\s+/gu," ");
 if(!/Lo\/Hi Craft Space/u.test(text)||!/Rayko Daskalov.*55|Райко Даскалов.*55/iu.test(text)||!/Plovdiv|Пловдив/iu.test(text))throw new Error("Lo/Hi: venue identity missing");
 const today=now.toLocaleDateString("sv-SE",{timeZone:"Europe/Sofia"});
 const items:PilotSnapshot["items"]=[];
 for(const card of cards){
  const title=D.textContent(D.getElementsByTagName("h3",card)[0]??card).trim(),date=card.attribs['data-date']??"",cardTime=card.attribs['data-time']??"";
  if(!/^20\d{2}-\d{2}-\d{2}$/u.test(date)||!Number.isFinite(Date.parse(`${date}T12:00:00Z`))||new Date(`${date}T12:00:00Z`).toISOString().slice(0,10)!==date||!/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(cardTime)||!title||title!==card.attribs['data-event'])throw new Error("Lo/Hi: explicit date or title missing");
  if(date<today)continue;
  const body=D.textContent(card).replace(/\s+/gu," ");
  const eventKind=/quiz|куиз/iu.test(title)?"quiz":/live|acoustic|концерт/iu.test(title)?"live":/party|dj set/iu.test(title)?"party":null;
  if(!eventKind)throw new Error("Lo/Hi: unknown event type");
  const describedStart=body.match(/Начало:\s*((?:[01]\d|2[0-3]):[0-5]\d)/iu)?.[1]??cardTime;
  const performance=body.match(/LIVE:\s*((?:[01]\d|2[0-3]):[0-5]\d)/iu)?.[1];
  const price=body.match(/Вход:\s*(\d+(?:[,.]\d{1,2})?)\s*€/iu);
  const free=/Вход свободен|свободен вход/iu.test(body);
  const donation=free&&/на шапка/iu.test(body);
  const announcement=D.getElementsByTagName("p",card).map(n=>D.textContent(n).trim()).join(" ");
  const status=/^(?:отменено|събитието е отменено|cancelled|canceled)(?:[.!\s]|$)/iu.test(announcement)||/^(?:отменено|cancelled)[!: .]/iu.test(title)?"EventCancelled":/^(?:отложено|събитието е отложено|postponed)(?:[.!\s]|$)/iu.test(announcement)?"EventPostponed":"EventScheduled";
  const notes=[announcement,donation?"Свободен вход с възможност за доброволен принос на място.":"",eventKind==="quiz"&&!announcement?"Куиз вечер. Условията за отбори и участие се уточняват при резервация.":"",describedStart!==cardTime?`В картата е обявен час ${cardTime}, а в описанието — ${describedStart}. Потвърди началото при резервация.`:""]
   .map(value=>value.replace(/\s+/gu," ").trim()).filter(Boolean);
  const fields:Record<string,string|number>={title,date,endDate:date,time:cardTime,place:"Lo/Hi Craft Space",address:'ул. „Райко Даскалов“ 55, Пловдив',eventKind,status,
   description:[...new Set(notes)].join("\n\n").slice(0,12000),...(performance?{performanceTime:performance}:{}),};
  if(price)fields.price=Number(price[1]!.replace(',','.'));else if(free)fields.price=0;
  const key=createHash("sha256").update(`${title}|${date}`).digest("hex");
  if(items.some(x=>x.key===key))throw new Error("Lo/Hi: duplicate event");
  items.push({key,sourceUrl:LOHI_URL,fields,fingerprint:createHash("sha256").update(JSON.stringify(fields)).digest("hex")});
 }
 return{sourceId:"lohi-programme",items,completeness:"uncertain",limitations:["Published venue programme only; no ticket availability. No event-specific photographs are present in these source cards. Removed events are not automatically declared cancelled."]};
}

import { createHash } from "node:crypto";
import { DomUtils as D, parseDocument } from "htmlparser2";
import type { PilotSnapshot } from "./parse";
export const PARKING_VENUES: Record<string,{url:string;title:string}> = {
 "mall-plovdiv-parking":{url:"https://mallplovdiv.bg/2026/01/05/pravila-za-parkirane-v-mall-plovdiv/",title:"Mall Plovdiv"},
 "markovo-tepe-parking":{url:"https://markovotepemall.bg/blog/pravila-za-polzvane-na-parkinga-na-mol-markovo-tepe/",title:"Мол Марково Тепе"},
};
export function parseParkingVenue(sourceId:string,html:string,contactHtml=""):PilotSnapshot {
 const config=PARKING_VENUES[sourceId];if(!config)throw new Error("parking: unknown operator");
 const root=parseDocument(html);for(const node of D.getElementsByTagName('script',root))D.removeElement(node);for(const node of D.getElementsByTagName('style',root))D.removeElement(node);
 const text=D.textContent(root).replace(/\s+/gu," ").trim();
 const mall=sourceId==="mall-plovdiv-parking";
 if(!text.toLocaleLowerCase("bg").includes(mall?"mall plovdiv":"марково тепе"))throw new Error("parking: operator identity missing");
 const free=text.match(mall?/Първият\s+(\d+)\s+час\s+от\s+пр[еe]стоя\s+е\s+безплатен/iu:/Първият\s+(\d+)\s+час\s+от\s+престоя\s+е\s+безплатен/iu);
 const price=text.match(mall?/За всеки започнат следващ час се такс?ува\s+(\d+[,.]\d{2})\s*€/iu:/Всеки следващ час се таксува\s+\d+[,.]\d{2}\s+лева\s*\/\s*(\d+[,.]\d{2})\s+евро/iu);
 const hours=text.match(mall?/РАБОТНОТО ВРЕМЕ на паркинга е от\s+(\d{1,2}:\d{2})\s*ч\.\s*до\s*(\d{1,2}:\d{2})/iu:/Работното време на паркинга е от\s+(\d{1,2}:\d{2})\s+до\s+(\d{1,2}:\d{2})/iu);
 const exit=text.match(mall?/разполагате с\s+(\d+)\s+минути за напускане/iu:/разполагате с\s+(\d+)\s+минути, за да напуснете/iu);
 const address=D.textContent(parseDocument(contactHtml||html)).replace(/\s+/gu," ").match(mall?/(?:ул\.|улица)\s*[„“”"]?Перущица[„“”"]?\s*(?:№\s*)?(\d+)/iu:/бул\.\s*[„“”"]?Руски[„“”"]?\s*(?:№\s*)?(\d+)/iu);
 if(!free||!price||!hours||!exit||!address)throw new Error("parking: tariff, hours or address structure changed");
 const freeHours=Number(free[1]),hourPrice=Number(price[1]!.replace(',','.')),exitMinutes=Number(exit[1]);
 if(freeHours<0||freeHours>24||hourPrice<=0||hourPrice>100||exitMinutes<=0||exitMinutes>60)throw new Error("parking: invalid tariff");
 const open=hours[1]!.padStart(5,'0'),close=hours[2]!.padStart(5,'0');
 if(![open,close].every(v=>/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(v)))throw new Error("parking: invalid hours");
 const fields={title:config.title,address:mall?`ул. „Перущица“ ${address[1]}, Пловдив`:`бул. „Руски“ ${address[1]}, Пловдив`,freeHours,hourPrice,currency:"EUR",opens:open,closes:close,exitMinutes,
 charging:"За всеки започнат час след безплатния престой.",
 conditions:mall?[text.match(/Клиенти на киното.{20,400}?(?=Клиенти на автокозметичния|Програма|РАБОТНОТО)/iu)?.[0],text.match(/Клиенти на автокозметичния.{20,400}?(?=Програма|РАБОТНОТО)/iu)?.[0]].filter(Boolean).join("\n"):text.match(/Безплатният престой се удължава.{20,700}?(?=След като)/iu)?.[0]??""};
 const contactRoot=parseDocument(contactHtml);
 const location=mall?D.getElementsByTagName("script",contactRoot).map(n=>D.textContent(n)).join("\n").match(/\['Mall Plovdiv'[^\]\r\n]{0,180}?,\s*(42\.\d+),\s*(24\.\d+),/u):null;
 const frame=D.getElementsByTagName("iframe",contactRoot).find(n=>{try{const u=new URL(n.attribs.src??"");return u.hostname==="www.google.com"&&u.pathname==="/maps/embed"}catch{return false}});
 const centre=!mall?frame?.attribs.src?.match(/!2d(24\.\d+)!3d(42\.\d+)/u):null;
 const lat=Number(location?.[1]??centre?.[2]),lon=Number(location?.[2]??centre?.[1]);
 const mappedFields={...fields,...(lat>=42.10&&lat<=42.19&&lon>=24.68&&lon<=24.82?{mapLat:lat,mapLon:lon}:{})};
 const fingerprint=createHash('sha256').update(JSON.stringify(mappedFields)).digest('hex');
 return{sourceId,items:[{key:sourceId,sourceUrl:config.url,fields:mappedFields,fingerprint}],completeness:"uncertain",limitations:["Operator tariff and hours only; no live occupancy, availability or reservation guarantee. Benefits require validation; long-stay and overnight charges are separate."]};
}

export async function collectParkingVenue(id:string,html:string,read:(url:string)=>Promise<string>){
 const contact=await read(id==="mall-plovdiv-parking"?"https://mallplovdiv.bg/kontakti/":"https://markovotepemall.bg/kontakti/");
 return parseParkingVenue(id,html,contact);
}


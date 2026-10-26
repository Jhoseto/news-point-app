import { describe,expect,it } from "vitest";
import { parseParkingVenue,collectParkingVenue } from "./parking-venues";
const mall=`<main>Mall Plovdiv. Първият 1 час от прeстоя е безплатен. За всеки започнат следващ час се такува 1,00 €. РАБОТНОТО ВРЕМЕ на паркинга е от 7:00 ч. до 23:30 ч. разполагате с 15 минути за напускане.</main>`;
const contact='<p>Пловдив, ул. „Перущица“ 8</p>';
describe("operator parking tariffs",()=>{
 it("extracts current euro tariff and contact address separately",async()=>{const urls:string[]=[];const s=await collectParkingVenue("mall-plovdiv-parking",mall,async u=>{urls.push(u);return contact});expect(s.items[0]?.fields).toMatchObject({hourPrice:1,freeHours:1,opens:"07:00",closes:"23:30",exitMinutes:15,address:'ул. „Перущица“ 8, Пловдив'});expect(urls).toEqual(["https://mallplovdiv.bg/kontakti/"])});
 it("detects price correction without changing identity",()=>{const a=parseParkingVenue("mall-plovdiv-parking",mall,contact).items[0]!,b=parseParkingVenue("mall-plovdiv-parking",mall.replace('1,00 €','1,50 €'),contact).items[0]!;expect(a.key).toBe(b.key);expect(a.fingerprint).not.toBe(b.fingerprint);expect(b.fields.hourPrice).toBe(1.5)});
 it("rejects blank, broken tariff, changed hours and missing address",()=>{for(const html of ['',mall.replace('1,00 €','няма тарифа'),mall.replace('23:30','25:30')])expect(()=>parseParkingVenue("mall-plovdiv-parking",html,contact)).toThrow();expect(()=>parseParkingVenue("mall-plovdiv-parking",mall)).toThrow()});
 it("extracts the second operator without mixing mall hours",()=>{const s=parseParkingVenue("markovo-tepe-parking",'<p>Марково Тепе. Работното време на паркинга е от 06:00 до 00:00 часа. Първият 1 час от престоя е безплатен. Всеки следващ час се таксува 2.00 лева / 1.02 евро. разполагате с 10 минути, за да напуснете. бул. ”Руски” 54</p>');expect(s.items[0]?.fields).toMatchObject({hourPrice:1.02,closes:"00:00"})});
});

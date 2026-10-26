import{describe,expect,it}from"vitest";import{parseLoHi}from"./lohi-programme";
const now=new Date('2026-10-26T12:00:00Z');
const page=(body:string,title='Music Quiz',date='2026-11-09')=>`<main>Lo/Hi Craft Space. Rayko Daskalov 55, Plovdiv<article class="event" data-event="${title}" data-date="${date}" data-time="20:00"><h3>${title}</h3><p>${body}</p></article></main>`;
describe('Lo/Hi explicit programme',()=>{
 it('extracts quiz without inventing price',()=>{expect(parseLoHi(page('Участие с отбори.'),now).items[0]?.fields).toMatchObject({eventKind:'quiz',date:'2026-11-09'});expect(parseLoHi(page('Участие с отбори.'),now).items[0]?.fields.price).toBeUndefined()});
 it('keeps contradictory source times explicit instead of inventing doors',()=>{const f=parseLoHi(page('Начало: 21:00 Вход свободен / На шапка','Acoustic Live'),now).items[0]!.fields;expect(f.time).toBe('20:00');expect(f.doorsTime).toBeUndefined();expect(f.description).toContain('21:00');expect(f.price).toBe(0)});
 it('detects price edits and cancellations; expires past dates',()=>{const a=parseLoHi(page('Вход: 15 €','Acoustic Live'),now).items[0]!,b=parseLoHi(page('Отменено. Вход: 18 €','Acoustic Live'),now).items[0]!;expect(a.key).toBe(b.key);expect(a.fingerprint).not.toBe(b.fingerprint);expect(b.fields.status).toBe('EventCancelled');expect(parseLoHi(page('Ако събитието бъде отменено, ще има съобщение.','Acoustic Live'),now).items[0]?.fields.status).toBe('EventScheduled');expect(parseLoHi(page('','Music Quiz','2026-10-20'),now).items).toEqual([])});
 it('rejects missing cards, lost year, impossible date or unknown genre',()=>{for(const html of ['',page('','Music Quiz','11-09'),page('','Music Quiz','2026-02-31'),page('','Unknown')])expect(()=>parseLoHi(html,now)).toThrow()});
});

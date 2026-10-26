import{createElement}from"react";import{renderToStaticMarkup}from"react-dom/server";import{expect,it}from"vitest";import{CityDesk}from"./city-desk";import type{CitySourceSummary}from"@newspoint/content/city-management";
it("renders actual initial summaries without flashing fabricated zero totals",()=>{
 const source:CitySourceSummary={id:"lohi-programme",category:"events",sourceUrl:"https://www.lohicraftspace.com/",format:"html",reviewState:"pilot",publicationState:"hidden",version:"a".repeat(32),lastCheckAt:new Date().toISOString(),lastSuccessAt:new Date().toISOString(),outcome:"parsed",error:null,currentRecords:8,missingRecords:0,firstCheckAt:new Date().toISOString(),successfulChecks:1,failedChecks:0};
 const html=renderToStaticMarkup(createElement(CityDesk,{initial:{sources:[source],collector:{status:"ok",checkedAt:new Date().toISOString()},checkedAt:new Date().toISOString()}}));
 expect(html).toContain("Lo/Hi Craft Space");expect(html).toContain("Нощен Пловдив");expect(html).toContain("Фонов събирач:");expect(html).toContain("работи");expect(html).not.toContain("Няма справки по тези условия");
});

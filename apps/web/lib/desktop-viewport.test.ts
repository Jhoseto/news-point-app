import { describe, expect, it, vi } from "vitest";
import { desktopDistance, desktopPoint, desktopRect, desktopViewportModel, getDesktopViewport } from "./desktop-viewport";
import { measureLatestFlyout } from "./latest-preview";
import { podcastPanelPlace } from "./podcast-playback";

const input = { width: 1366, availableWidth: 1366, height: 650, desktop: true, browser: true, screen: true, zoomSupported: true };
describe("desktop viewport coordinate contract", () => {
  it("leaves native mobile/PWA measurements untouched without reading layout", () => {
    vi.stubGlobal("window", {innerWidth:390,innerHeight:844,__npDesktopViewport:{model:{active:false,scale:1,width:390,height:844},measureZoom:false}});
    vi.stubGlobal("document", {documentElement:{getBoundingClientRect:()=>{throw new Error("Native mode must not measure zoom");}}});
    try { expect(desktopDistance(44)).toBe(44);expect(getDesktopViewport().height).toBe(844); }
    finally { vi.unstubAllGlobals(); }
  });
  it("uses the measured layout during the frame between a resize request and CSS zoom reflow", () => {
    let renderedWidth=1366;
    vi.stubGlobal("window", { innerWidth:1440,innerHeight:650,__npDesktopViewport:{model:desktopViewportModel({...input,width:1440,availableWidth:1440})} });
    vi.stubGlobal("document", {documentElement:{offsetWidth:1920,getBoundingClientRect:()=>({width:renderedWidth})}});
    try {
      const physicalLeft=880*1366/1920;
      expect(desktopRect({left:physicalLeft,right:physicalLeft+100,top:0,bottom:10,width:100,height:10}).left).toBeCloseTo(880);
      renderedWidth=1440;
      expect(getDesktopViewport().scale).toBe(.75);
    } finally { vi.unstubAllGlobals(); }
  });
  it.each([1024,1280,1366,1440,1536,1680])("keeps a 1920 composition at %ipx without using height to shrink it", width => {
    const model=desktopViewportModel({...input,width,availableWidth:width});
    expect(model.active).toBe(true);
    expect(model.width).toBe(1920);
    expect(model.scale*model.width).toBeCloseTo(width);
    expect(model.scale*model.height).toBeCloseTo(650);
    expect(desktopViewportModel({...input,width,availableWidth:width,height:600}).scale).toBe(model.scale);
  });
  it.each([{desktop:false},{browser:false},{screen:false},{zoomSupported:false},{width:1920},{width:2560},{availableWidth:0}])("preserves native coordinates outside its supported browser range: %j", overrides => {
    const model=desktopViewportModel({...input,...overrides});
    expect(model.active).toBe(false);expect(model.scale).toBe(1);
    expect(desktopPoint({x:71,y:42},model)).toEqual({x:71,y:42});
  });
  it("converts a physical rectangle and pointer deltas exactly once, preserving anchor relationships", () => {
    const model=desktopViewportModel({...input,availableWidth:1356});
    const logical={left:900,top:70,right:1050,bottom:106,width:150,height:36};
    const physical=Object.fromEntries(Object.entries(logical).map(([k,v])=>[k,v*model.scale])) as typeof logical;
    const result=desktopRect(physical,model);
    for(const key of Object.keys(logical) as (keyof typeof logical)[])expect(result[key]).toBeCloseTo(logical[key]);
    const place=podcastPanelPlace(model.width,result.left,result.width);
    expect((place.left+place.arrow)*model.scale).toBeCloseTo((logical.left+logical.width/2)*model.scale);
    expect(desktopDistance(96*model.scale,model)).toBeCloseTo(96);
    const point=desktopPoint({x:960*model.scale,y:100*model.scale},model);
    expect(point.x).toBeCloseTo(960);expect(point.y).toBeCloseTo(100);
  });
  it("keeps the hover card beside the same logical stage across scaled viewports", () => {
    const rect=(left:number,top:number,width:number,height:number)=>({left,top,right:left+width,bottom:top+height,width,height});
    const stage=rect(288,134,1236,518),panel=rect(1539,134,331,518),link=rect(1555,200,299,44);
    const expected=measureLatestFlyout({stage,panel,link,viewportHeight:1080});
    for(const width of [1024,1366,1680]){
      const model=desktopViewportModel({...input,width,availableWidth:width,height:1080*width/1920});
      const scaled=(r:typeof stage)=>desktopRect(Object.fromEntries(Object.entries(r).map(([k,v])=>[k,v*model.scale])) as typeof stage,model);
      expect(measureLatestFlyout({stage:scaled(stage),panel:scaled(panel),link:scaled(link),viewportHeight:model.height})).toEqual(expected);
    }
  });
});

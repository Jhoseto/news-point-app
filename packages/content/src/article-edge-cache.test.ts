import {describe,expect,it} from "vitest";
import {articleDocumentCandidate,articleEdgePath,articleViewport,canonicalArticleCachePath,hasArticleEdgeMarker,articleEdgeMarker} from "./article-edge-cache";
const origin="https://news.example";
function request(path="/article/",headers:Record<string,string>={},method="GET") {
  return new Request(new URL(path,origin),{method,headers:{accept:"text/html","user-agent":"Mozilla/5.0 Chrome/145",...headers}});
}

describe("article document cache isolation",()=>{
  it("shares tracking links but isolates viewport representations",()=>{
    const a=articleDocumentCandidate(request('/article/?fbclid=one&utm_source=social'),origin)!;
    expect(a).toEqual({path:'/article/',viewport:'desktop'});
    const b=articleDocumentCandidate(request('/article/',{cookie:'np-viewport=mobile; cf_clearance=passive'}),origin)!;
    expect(b.viewport).toBe('mobile');
    expect(articleEdgePath(a.path,a.viewport)).not.toBe(articleEdgePath(b.path,b.viewport));
  });
  it.each([
    {cookie:'better-auth.session_token=editor'}, {cookie:'__Secure-better-auth.session_token=editor'},
    {cookie:'np-private-preference=custom'}, {cookie:'np-viewport=mobile; np-viewport=desktop'},
    {authorization:'Bearer editor'}, {rsc:'1'}, {'next-router-state-tree':'state'},
    {'next-router-prefetch':'1'}, {'next-router-segment-prefetch':'segment'}, {'next-action':'action'},
    {'x-prerender-revalidate':'secret'}, {range:'bytes=0-10'}, {'cache-control':'no-cache'},
    {'user-agent':'Mozilla/5.0 Googlebot'}, {'user-agent':'facebookexternalhit/1.1'}, {accept:'text/x-component'},
  ])("bypasses authenticated, preference, crawler and navigation requests: %j",headers=>{
    expect(articleDocumentCandidate(request('/article/',headers),origin)).toBeNull();
  });
  it.each(['/admin/login/','/api/live/','/draft/article/','/settings/','/search/','/edge-article-cache/v1/desktop/article/','/article/?preview=1','/article/?_rsc=secret'])('bypasses %s',path=>{
    expect(articleDocumentCandidate(request(path),origin)).toBeNull();
  });
  it('does not admit another host, HEAD or POST',()=>{
    expect(articleDocumentCandidate(request(),"https://different.example")).toBeNull();
    expect(articleDocumentCandidate(request('/article/',{},'HEAD'),origin)).toBeNull();
    expect(articleDocumentCandidate(request('/article/',{},'POST'),origin)).toBeNull();
  });
  it.each(['/','/news','//news/','/../news/','/news%2Fadmin/','/news%252Fadmin/','/news\\admin/','/news/?draft=1','/%ZZ/'])('rejects noncanonical or unsafe paths: %s',path=>{
    expect(canonicalArticleCachePath(path)).toBeNull();
  });
  it('normalizes Unicode without creating extra representations',()=>{
    expect(canonicalArticleCachePath('/новина/')).toBe(canonicalArticleCachePath('/%D0%BD%D0%BE%D0%B2%D0%B8%D0%BD%D0%B0/'));
  });
  it('matches the opt-in marker only for its article path',()=>{
    const html=`<meta name="np-public-article" content="${articleEdgeMarker('/article/')}">`;
    expect(hasArticleEdgeMarker(html,'/article/')).toBe(true);
    expect(hasArticleEdgeMarker(html,'/other/')).toBe(false);
    expect(hasArticleEdgeMarker('<h1>Private document</h1>','/article/')).toBe(false);
  });
  it('uses measured viewport, then width, mobile hint, and UA',()=>{
    expect(articleViewport(new Headers({cookie:'np-viewport=mobile','sec-ch-viewport-width':'1400'}))).toBe('mobile');
    expect(articleViewport(new Headers({'sec-ch-viewport-width':'800','sec-ch-ua-mobile':'?0'}))).toBe('mobile');
    expect(articleViewport(new Headers({'sec-ch-ua-mobile':'?1'}))).toBe('mobile');
    expect(articleViewport(new Headers({'user-agent':'Mozilla/5.0 iPhone'}))).toBe('mobile');
  });
});

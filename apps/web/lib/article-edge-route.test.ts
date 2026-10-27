import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('./queries',()=>({getCategoryByPath:vi.fn(),getArticleByPath:vi.fn()}));
import {getCategoryByPath,getArticleByPath} from './queries';
import {GET} from '../app/edge-article-cache/v1/[viewport]/[...path]/route';
import {articleEdgeMarker} from '../../../packages/content/src/article-edge-cache';
const request=vi.fn();
const page=`<!DOCTYPE html><meta name="np-public-article" content="${articleEdgeMarker('/article/')}"><h1>Explicit fixture</h1>`;
function call(headers:Record<string,string>={},viewport='desktop',url='https://news.example/edge-article-cache/v1/desktop/article/') {
  return GET(new Request(url,{headers}),{params:Promise.resolve({viewport,path:['article']})});
}
beforeEach(()=>{
  vi.stubEnv('NODE_ENV','production');vi.stubEnv('NP_PUBLIC_INDEXING','1');vi.stubEnv('NP_ARTICLE_EDGE_CACHE','1');
  vi.stubEnv('WEB_URL','https://news.example');vi.stubEnv('REVALIDATE_INTERNAL_URL','http://127.0.0.1:3100');
  vi.stubEnv('CLOUDFLARE_CACHE_ZONE_ID','a'.repeat(32));vi.stubEnv('CLOUDFLARE_CACHE_PURGE_TOKEN','test-only-token');
  vi.mocked(getCategoryByPath).mockReset().mockResolvedValue(null);
  vi.mocked(getArticleByPath).mockReset().mockResolvedValue({path:'/article/'} as Awaited<ReturnType<typeof getArticleByPath>>);
  request.mockReset().mockImplementation(async()=>new Response(page,{headers:{'content-type':'text/html'}}));vi.stubGlobal('fetch',request);
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('public article cache render endpoint',()=>{
  it('exports a public short-lived document only after the public article lookup',async()=>{
    const response=await call();expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=30, must-revalidate');
    expect(response.headers.get('x-robots-tag')).toContain('noindex');expect(response.headers.get('x-np-article-cache-eligible')).toBe('v1');
    expect(await response.text()).toBe(page);expect(getArticleByPath).toHaveBeenCalledWith('/article/');
  });
  it.each([{cookie:'session=editor'},{cookie:'np-viewport=mobile'},{authorization:'Bearer editor'}])('rejects caller credentials/preferences before any lookup: %j',async headers=>{
    const response=await call(headers);expect(response.status).toBe(404);expect(getArticleByPath).not.toHaveBeenCalled();expect(request).not.toHaveBeenCalled();
  });
  it('rejects unsupported viewports, query parameters and disabled configuration',async()=>{
    expect((await call({},'tablet')).status).toBe(404);
    expect((await call({},'desktop','https://news.example/edge-article-cache/v1/desktop/article/?preview=1')).status).toBe(404);
    vi.stubEnv('NP_ARTICLE_EDGE_CACHE','0');expect((await call()).status).toBe(404);expect(request).not.toHaveBeenCalled();
  });
  it('never caches a draft/hidden/missing article, category, or legacy alias',async()=>{
    vi.mocked(getArticleByPath).mockResolvedValueOnce(null);let response=await call();expect(response.status).toBe(404);expect(response.headers.get('cache-control')).toContain('no-store');
    vi.mocked(getCategoryByPath).mockResolvedValueOnce({path:'/article/'} as Awaited<ReturnType<typeof getCategoryByPath>>);expect((await call()).status).toBe(404);
    vi.mocked(getArticleByPath).mockResolvedValueOnce({path:'/other/'} as Awaited<ReturnType<typeof getArticleByPath>>);expect((await call()).status).toBe(404);
    expect(request).not.toHaveBeenCalled();
  });
});

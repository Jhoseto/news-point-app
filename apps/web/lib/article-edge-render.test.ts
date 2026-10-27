import {afterEach,describe,expect,it,vi} from 'vitest';
import {articleEdgeMarker} from '../../../packages/content/src/article-edge-cache';
import {ArticleHtmlFlights,articleEdgeConfig,MAX_ARTICLE_HTML_BYTES,renderAnonymousArticle} from './article-edge-render';

const env={NODE_ENV:'production',NP_PUBLIC_INDEXING:'1',NP_ARTICLE_EDGE_CACHE:'1',WEB_URL:'https://news.example',REVALIDATE_INTERNAL_URL:'http://127.0.0.1:3100',CLOUDFLARE_CACHE_ZONE_ID:'a'.repeat(32),CLOUDFLARE_CACHE_PURGE_TOKEN:'test-only-secret'};
const html=`<!DOCTYPE html><html><head><meta name="np-public-article" content="${articleEdgeMarker('/article/')}"></head><body>Explicit test fixture</body></html>`;
const payload={body:new TextEncoder().encode(html),contentType:'text/html; charset=utf-8'};
afterEach(()=>vi.unstubAllGlobals());

describe('anonymous article fill',()=>{
  it('fails closed without production indexing, purge credentials or a loopback origin',()=>{
    expect(articleEdgeConfig(env)).not.toBeNull();
    for(const change of [{NP_ARTICLE_EDGE_CACHE:'0'},{NP_PUBLIC_INDEXING:'0'},{NODE_ENV:'development'},{CLOUDFLARE_CACHE_PURGE_TOKEN:''},{REVALIDATE_INTERNAL_URL:'http://external.example'},{REVALIDATE_INTERNAL_URL:'http://127.0.0.1:3100/admin/'},{WEB_URL:'http://news.example'}]) {
      expect(articleEdgeConfig({...env,...change})).toBeNull();
    }
  });
  it('renders using only a fixed viewport cookie and a loopback URL',async()=>{
    const fetcher=vi.fn(async(_input: RequestInfo | URL,_options?: RequestInit)=>new Response(html,{headers:{'content-type':'text/html'}}));vi.stubGlobal('fetch',fetcher);
    const result=await renderAnonymousArticle('/article/','mobile',articleEdgeConfig(env)!);
    expect(new TextDecoder().decode(result.body)).toBe(html);
    expect(String(fetcher.mock.calls[0]?.[0])).toBe('http://127.0.0.1:3100/article/');
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({redirect:'manual',cache:'no-store',headers:{cookie:'np-viewport=mobile','sec-ch-ua-mobile':'?1'}});
  });
  it.each([
    {status:302,headers:{location:'/admin/'}}, {status:404,headers:{}}, {status:200,headers:{'set-cookie':'session=private'}},
    {status:200,headers:{'x-robots-tag':'noindex'}}, {status:200,headers:{'content-type':'text/x-component'}},
  ])('rejects redirects, errors and non-public responses: %j',async options=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(html,{...options,headers:{'content-type':'text/html',...options.headers}})));
    await expect(renderAnonymousArticle('/article/','desktop',articleEdgeConfig(env)!)).rejects.toThrow();
  });
  it('rejects a streamed fallback lacking the article marker',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('<html>Not found</html>',{headers:{'content-type':'text/html'}})));
    await expect(renderAnonymousArticle('/article/','desktop',articleEdgeConfig(env)!)).rejects.toThrow('marker');
  });
  it('bounds buffered HTML size',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Uint8Array(MAX_ARTICLE_HTML_BYTES+1),{headers:{'content-type':'text/html'}})));
    await expect(renderAnonymousArticle('/article/','desktop',articleEdgeConfig(env)!)).rejects.toThrow('limit');
  });
  it('coalesces 1000 simultaneous fills for one representation',async()=>{
    const flights=new ArticleHtmlFlights();const load=vi.fn(async()=>payload);
    const results=await Promise.all(Array.from({length:1000},()=>flights.render('/article/','desktop',load)));
    expect(load).toHaveBeenCalledTimes(1);expect(results).toHaveLength(1000);
    expect(results.every(result=>result===payload)).toBe(true);
    await flights.render('/article/','desktop',load);expect(load).toHaveBeenCalledTimes(2);
  });
  it('never coalesces mobile into the desktop representation',async()=>{
    const flights=new ArticleHtmlFlights();const load=vi.fn(async()=>payload);
    await Promise.all([flights.render('/article/','mobile',load),flights.render('/article/','desktop',load)]);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it('discards an in-flight render invalidated by an editorial change',async()=>{
    const flights=new ArticleHtmlFlights();let finish!: (result:typeof payload)=>void;
    const pending=flights.render('/article/','desktop',()=>new Promise(resolve=>{finish=resolve}));
    await Promise.resolve();flights.invalidate(['/article/']);finish(payload);
    await expect(pending).rejects.toThrow('changed');
    await expect(flights.render('/article/','desktop',async()=>payload)).resolves.toBe(payload);
  });
  it('bounds distinct in-flight renders and releases failures',async()=>{
    const flights=new ArticleHtmlFlights();const releases:Array<()=>void>=[];
    const pending=Array.from({length:24},(_,n)=>flights.render(`/article-${n}/`,'desktop',()=>new Promise(resolve=>releases.push(()=>resolve(payload)))));
    await Promise.resolve();await expect(flights.render('/overflow/','desktop',async()=>payload)).rejects.toThrow('capacity');
    releases.forEach(release=>release());await Promise.all(pending);
    await expect(flights.render('/overflow/','desktop',async()=>{throw new Error('temporary')})).rejects.toThrow('temporary');
    await expect(flights.render('/overflow/','desktop',async()=>payload)).resolves.toBe(payload);
  });
});

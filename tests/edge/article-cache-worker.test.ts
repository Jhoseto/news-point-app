import {describe,expect,it,vi} from 'vitest';
import {createArticleCacheWorker} from '../../deploy/cloudflare/article-cache-worker';
const env={ENABLED:'1',PUBLIC_ORIGIN:'https://news.example'};
const doc=(headers:Record<string,string>={},path='/article/')=>new Request(new URL(path,env.PUBLIC_ORIGIN),{headers:{accept:'text/html','user-agent':'Mozilla/5.0 Chrome/145',...headers}});

describe('public document edge Worker',()=>{
  it('fetches only the normalized public endpoint and serves an edge hit privately to the browser',async()=>{
    const fetcher=vi.fn(async(_input: Request,_options?: RequestInit)=>new Response('explicit fixture',{headers:{'content-type':'text/html','x-np-article-cache-eligible':'v1','x-robots-tag':'noindex, nofollow','cf-cache-status':'HIT','cache-control':'public, s-maxage=30'}}));
    const result=await createArticleCacheWorker(fetcher).fetch(doc({cookie:'np-viewport=mobile; cf_clearance=passive','x-forwarded-host':'poison.example'},'/article/?fbclid=tracking'),env);
    const [fill,options]=fetcher.mock.calls[0]!;
    expect(fill.url).toBe('https://news.example/edge-article-cache/v1/mobile/article/');
    expect(fill.headers.has('cookie')).toBe(false);expect(fill.headers.has('x-forwarded-host')).toBe(false);
    expect(options).toEqual({cf:{cacheEverything:true,cacheTtlByStatus:{'201-599':-1}}});
    expect(result.headers.get('x-np-article-cache')).toBe('HIT');
    expect(result.headers.get('cache-control')).toBe('private, no-store');
    expect(result.headers.has('x-robots-tag')).toBe(false);expect(await result.text()).toBe('explicit fixture');
  });
  it.each([{cookie:'better-auth.session_token=editor'},{rsc:'1'},{cookie:'unknown-preference=private'}])('passes private/navigation requests through intact: %j',async headers=>{
    const original=doc(headers);const fetcher=vi.fn(async()=>new Response('original'));
    await createArticleCacheWorker(fetcher).fetch(original,env);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(original);
  });
  it.each([{}, {ENABLED:'0',PUBLIC_ORIGIN:env.PUBLIC_ORIGIN},{ENABLED:'1',PUBLIC_ORIGIN:'http://news.example'}])('is inert before activation: %j',async config=>{
    const original=doc();const fetcher=vi.fn(async()=>new Response('original'));
    await createArticleCacheWorker(fetcher).fetch(original,config);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(original);
  });
  it.each([
    new Response('not found',{status:404}),new Response('unmarked',{headers:{'content-type':'text/html'}}),
    new Response('private',{headers:{'content-type':'text/html','x-np-article-cache-eligible':'v1','set-cookie':'secret=editor'}}),
  ])('falls back to the normal site when a fill is not eligible',async fill=>{
    const original=doc();const fetcher=vi.fn().mockResolvedValueOnce(fill).mockResolvedValueOnce(new Response('normal'));
    const response=await createArticleCacheWorker(fetcher).fetch(original,env);
    expect(await response.text()).toBe('normal');expect(fetcher.mock.calls[1]?.[0]).toBe(original);
  });
  it('preserves availability when the cache subrequest fails',async()=>{
    const original=doc();const fetcher=vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(new Response('normal'));
    expect(await (await createArticleCacheWorker(fetcher).fetch(original,env)).text()).toBe('normal');
  });
});

import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {purgeArticleEdgePaths} from './article-edge-purge';
const request=vi.fn();
beforeEach(()=>{
  vi.stubEnv('NODE_ENV','production');vi.stubEnv('NP_PUBLIC_INDEXING','1');vi.stubEnv('NP_ARTICLE_EDGE_CACHE','1');
  vi.stubEnv('WEB_URL','https://news.example');vi.stubEnv('REVALIDATE_INTERNAL_URL','http://127.0.0.1:3100');
  vi.stubEnv('CLOUDFLARE_CACHE_ZONE_ID','a'.repeat(32));vi.stubEnv('CLOUDFLARE_CACHE_PURGE_TOKEN','test-only-token');
  vi.stubGlobal('fetch',request);request.mockReset();request.mockImplementation(async()=>Response.json({success:true}));
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('global article cache purge',()=>{
  it('purges both actual fetch URLs and deduplicates paths',async()=>{
    expect(await purgeArticleEdgePaths(['/article/','/article/','/'])).toBe('ok');
    const [url,options]=request.mock.calls[0]!;
    expect(url).toBe(`https://api.cloudflare.com/client/v4/zones/${'a'.repeat(32)}/purge_cache`);
    expect(JSON.parse(options.body)).toEqual({files:[
      'https://news.example/edge-article-cache/v1/desktop/article/',
      'https://news.example/edge-article-cache/v1/mobile/article/',
    ]});
    expect(options.headers.authorization).toBe('Bearer test-only-token');
  });
  it('bounds purge batches and never submits arbitrary origins/private routes',async()=>{
    await purgeArticleEdgePaths([...Array.from({length:20},(_,i)=>`/article-${i}/`),'https://evil.example/','/admin/private/','/../escape/']);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls.map(c=>JSON.parse(c[1].body).files.length)).toEqual([30,10]);
  });
  it('does not make provider calls when disabled',async()=>{
    vi.stubEnv('NP_ARTICLE_EDGE_CACHE','0');expect(await purgeArticleEdgePaths(['/article/'])).toBe('disabled');expect(request).not.toHaveBeenCalled();
  });
  it('reports failures without treating publication as a completed purge',async()=>{
    request.mockResolvedValueOnce(Response.json({success:false}));expect(await purgeArticleEdgePaths(['/article/'])).toBe('error');
    request.mockResolvedValueOnce(new Response(null,{status:403}));expect(await purgeArticleEdgePaths(['/article/'])).toBe('error');
    request.mockRejectedValueOnce(Error('provider details must stay private'));expect(await purgeArticleEdgePaths(['/article/'])).toBe('error');
    vi.stubEnv('CLOUDFLARE_CACHE_PURGE_TOKEN','');expect(await purgeArticleEdgePaths(['/article/'])).toBe('error');
  });
});

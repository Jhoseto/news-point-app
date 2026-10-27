import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('@newspoint/db',()=>({loadRootEnv:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn(),revalidateTag:vi.fn()}));
vi.mock('./article-edge-purge',()=>({purgeArticleEdgePaths:vi.fn(async()=>"ok")}));
import {revalidatePath} from 'next/cache';
import {articleHtmlFlights} from './article-edge-render';
import {purgeArticleEdgePaths} from './article-edge-purge';
import {POST} from '../app/api/revalidate/route';
function call(secret='test-only-secret',body:unknown={paths:['/article/']}) {
  return POST(new Request('https://news.example/api/revalidate/',{method:'POST',headers:{'x-revalidate-secret':secret,'content-type':'application/json'},body:JSON.stringify(body)}));
}
beforeEach(()=>{vi.stubEnv('REVALIDATE_SECRET','test-only-secret');vi.mocked(purgeArticleEdgePaths).mockClear().mockResolvedValue('ok');vi.mocked(revalidatePath).mockClear();});
afterEach(()=>vi.unstubAllEnvs());
describe('article cache invalidation boundary',()=>{
  it('requires authorization and valid site paths before purging',async()=>{
    expect((await call('wrong')).status).toBe(401);
    expect((await call('test-only-secret',{paths:['https://evil.example/']})).status).toBe(400);
    expect(purgeArticleEdgePaths).not.toHaveBeenCalled();
  });
  it('invalidates active fills, revalidates Next, then awaits global purge',async()=>{
    const invalidate=vi.spyOn(articleHtmlFlights,'invalidate');
    const response=await call();expect(response.status).toBe(200);
    expect(invalidate).toHaveBeenCalledWith(['/article/']);expect(revalidatePath).toHaveBeenCalledWith('/article/');
    expect(purgeArticleEdgePaths).toHaveBeenCalledWith(['/article/']);
    expect(invalidate.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(purgeArticleEdgePaths).mock.invocationCallOrder.at(-1)!);
    invalidate.mockRestore();
  });
  it('reports purge failure instead of claiming the edge copy was cleared',async()=>{
    vi.mocked(purgeArticleEdgePaths).mockResolvedValueOnce('error');
    const response=await call();expect(response.status).toBe(503);expect(await response.json()).toEqual({revalidated:1,edgeCache:'error'});
  });
});

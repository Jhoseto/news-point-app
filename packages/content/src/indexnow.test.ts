import { describe, expect, it } from "vitest";
import { indexNowArticleUrl, indexNowRetryMs, readIndexNowConfig } from "./indexnow";

const env = { NP_INDEXNOW_ENABLED: "1", INDEXNOW_KEY: "explicit-fixture-key", INDEXNOW_ORIGIN: "https://example.com" };
describe("IndexNow boundaries", () => {
  it("is opt-in and requires explicit HTTPS origin and valid key", () => {
    expect(readIndexNowConfig({})).toBeNull();
    expect(readIndexNowConfig(env)?.keyLocation).toBe("https://example.com/indexnow-key.txt");
    for (const origin of ["http://example.com","https://example.com/path","https://user:secret@example.com","https://127.0.0.1","https://example.com?x=1"]) {
      expect(readIndexNowConfig({...env, INDEXNOW_ORIGIN:origin})).toBeNull();
    }
    expect(readIndexNowConfig({...env,INDEXNOW_KEY:"short"})).toBeNull();
  });
  it("accepts canonical Unicode but rejects private, traversal, query and external paths", () => {
    expect(indexNowArticleUrl("/новина/",env.INDEXNOW_ORIGIN)).toBe("https://example.com/%D0%BD%D0%BE%D0%B2%D0%B8%D0%BD%D0%B0/");
    expect(indexNowArticleUrl("/%D0%BD%D0%BE%D0%B2%D0%B8%D0%BD%D0%B0/",env.INDEXNOW_ORIGIN)).not.toBeNull();
    for (const path of ["/admin/","/api/","/draft/","/qa-editor-demo/","//evil.test/","https://evil.test/","/one/?draft=1","/../","/%2e%2e/","/a%2fb/","/x%ZZ/","/x#draft/"]) {
      expect(indexNowArticleUrl(path,env.INDEXNOW_ORIGIN),path).toBeNull();
    }
  });
  it("backs off and respects seconds/date Retry-After with a one-day bound", () => {
    expect(indexNowRetryMs(1,null)).toBe(60_000);
    expect(indexNowRetryMs(2,"600")).toBe(600_000);
    expect(indexNowRetryMs(1,new Date(600_000).toUTCString(),0)).toBe(600_000);
    expect(indexNowRetryMs(20,"99999999")).toBe(86400_000);
  });
});

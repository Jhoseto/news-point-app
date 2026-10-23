import { describe, expect, it } from "vitest";
import {
  articleReadRequestBody,
  isArticleReadSameOrigin,
  markArticleReadCounted,
  markArticleReadsEligibleAfterNavigation,
  shareArticleRead,
  shouldSendArticleRead,
} from "./article-read";

describe("isArticleReadSameOrigin", () => {
  it("accepts the host the browser used, including a public name behind the proxy", () => {
    expect(isArticleReadSameOrigin({
      origin: "http://127.0.0.1:3000",
      host: "127.0.0.1:3000",
      forwardedHost: "127.0.0.1:3000",
      forwardedProto: null,
      fetchSite: "same-origin",
    })).toBe(true);
    expect(isArticleReadSameOrigin({
      origin: "https://site.example",
      host: "127.0.0.1:3100",
      forwardedHost: "site.example",
      forwardedProto: "https",
      fetchSite: "same-origin",
    })).toBe(true);
  });

  it("rejects another site and a protocol mismatch", () => {
    expect(isArticleReadSameOrigin({
      origin: "https://evil.example",
      host: "site.example",
      forwardedHost: "site.example",
      forwardedProto: "https",
      fetchSite: "same-origin",
    })).toBe(false);
    expect(isArticleReadSameOrigin({
      origin: "https://site.example",
      host: "site.example",
      forwardedHost: "site.example",
      forwardedProto: "https",
      fetchSite: "cross-site",
    })).toBe(false);
    expect(isArticleReadSameOrigin({
      origin: "http://site.example",
      host: "site.example",
      forwardedHost: null,
      forwardedProto: "https",
      fetchSite: "same-origin",
    })).toBe(false);
  });
});

describe("article read session", () => {
  it("uses one cookie-free request shape for first opens and returns", () => {
    expect(articleReadRequestBody()).toBe("{}");
  });

  it("counts once per tab session until another route opens and the reader returns", () => {
    const storage = new Map<string, string>();
    const session = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
      key: (index: number) => [...storage.keys()][index] ?? null,
      get length() { return storage.size; },
      clear: () => storage.clear(),
    } satisfies Storage;

    expect(shouldSendArticleRead("a", session)).toBe(true);
    markArticleReadCounted("a", session);
    expect(shouldSendArticleRead("a", session)).toBe(false);
    markArticleReadsEligibleAfterNavigation(session);
    expect(shouldSendArticleRead("a", session)).toBe(true);
    markArticleReadCounted("a", session);
    expect(shouldSendArticleRead("a", session)).toBe(false);
  });
});

describe("shareArticleRead", () => {
  it("counts one shared request while an open is in flight, then counts the next open", async () => {
    let calls = 0;
    const send = async () => {
      calls += 1;
      return calls;
    };
    const [first, second] = await Promise.all([
      shareArticleRead("article-open", send),
      shareArticleRead("article-open", send),
    ]);
    expect(first).toBe(1);
    expect(second).toBe(1);
    expect(calls).toBe(1);
    expect(await shareArticleRead("article-open", send)).toBe(2);
    expect(calls).toBe(2);
  });
});

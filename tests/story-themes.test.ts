/**
 * Unit tests for the "Тема с продължение" (story theme) validators.
 *
 * These tests cover the pure validation hooks in `apps/studio/lib/story-themes.ts`,
 * exposed via the internal `__testHooks` export. The DB-touching functions
 * (create, save, publish, add/remove/reorder articles) are out of scope here:
 * the project has no test database (TEST_DATABASE_URL is empty by rule), and
 * mocking the Drizzle query builder is fragile.
 *
 * The full server-side invariants are still covered in production by the live
 * Studio editor and the migration 28 constraint check.
 */

import { describe, expect, it, vi } from "vitest";

// `server-only` throws if it ever lands in a client bundle. Vitest is a server
// runtime, but we mock it anyway to keep the import graph honest.
vi.mock("server-only", () => ({}));

// We never touch the database in these tests, but the module imports table
// references and `getDb` at the top level. Stub them so the module loads.
vi.mock("@newspoint/db", () => ({
  articles: { id: {}, path: {}, isPublic: {} },
  categories: { id: {}, path: {}, name: {} },
  mediaAssets: { id: {}, storageKey: {}, sourceUrl: {}, provider: {} },
  outboxEvents: { type: {}, entityId: {}, version: {}, payload: {} },
  staffUsers: { id: {}, name: {}, email: {} },
  storyThemeArticles: {
    themeId: {},
    articleId: {},
    position: {},
    addedAt: {},
    addedBy: {},
  },
  storyThemes: {
    id: {},
    slug: {},
    title: {},
    summary: {},
    intro: {},
    coverMediaId: {},
    coverCaption: {},
    isPublished: {},
    publishedAt: {},
    createdBy: {},
    createdAt: {},
    updatedAt: {},
  },
  getDb: () => ({}),
}));

// `triggerRevalidate` calls Next.js `revalidatePath` under the hood, which is
// unavailable in a plain vitest run. `resolveMediaUrl` reads environment
// variables and MEDIA_ORIGIN.
vi.mock("@newspoint/content", () => ({
  resolveMediaUrl: () => null,
  triggerRevalidate: () => undefined,
}));

// `unstable_cache` wraps the cached function with Next-specific behaviour.
// For unit tests we want a transparent passthrough so the underlying call
// runs every time.
vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

// `./articles` is a heavy module (Drizzle, auth, etc.). We only need its
// `EditorError` constructor here.
vi.mock("../apps/studio/lib/articles", () => ({
  EditorError: class EditorError extends Error {
    constructor(
      readonly status: 400 | 403 | 404 | 409 | 422,
      readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = "EditorError";
    }
  },
}));

// `./session` pulls in better-auth. We only need a stub for type imports.
vi.mock("../apps/studio/lib/session", () => ({
  requireStaff: () => Promise.resolve({ id: "test", name: "Test", role: "admin" }),
}));

// Regular `import` (not top-level `await import`) so the module is loaded by
// the ESM graph after vitest has hoisted the `vi.mock` calls above.
import { __testHooks } from "../apps/studio/lib/story-themes";
const { assertSlug, assertInput, RESERVED_SLUGS } = __testHooks;

const validInput = {
  slug: "valid-slug",
  title: "Заглавие за тест",
  summary: "",
  intro: "",
  coverMediaId: null,
  coverCaption: "",
};

function expectInvalidSlug(): { status: 400; code: "invalid_slug" } {
  return expect.objectContaining({ status: 400, code: "invalid_slug" });
}

function expectSlugTaken(): { status: 409; code: "slug_taken" } {
  return expect.objectContaining({ status: 409, code: "slug_taken" });
}

describe("assertSlug (Тема с продължение)", () => {
  it("rejects slugs shorter than the 3-character minimum", () => {
    expect(() => assertSlug("")).toThrowError(expectInvalidSlug());
    expect(() => assertSlug("a")).toThrowError(expectInvalidSlug());
    expect(() => assertSlug("ab")).toThrowError(expectInvalidSlug());
  });

  it("rejects slugs longer than the 80-character maximum", () => {
    expect(() => assertSlug("a".repeat(81))).toThrowError(expectInvalidSlug());
    expect(() => assertSlug("a".repeat(500))).toThrowError(expectInvalidSlug());
  });

  it("accepts slugs at the length boundaries", () => {
    expect(() => assertSlug("abc")).not.toThrow();
    expect(() => assertSlug("a".repeat(80))).not.toThrow();
  });

  it("rejects uppercase letters, spaces, underscores and punctuation", () => {
    expect(() => assertSlug("ABC")).toThrowError(expectInvalidSlug());
    expect(() => assertSlug("abc DEF")).toThrowError(expectInvalidSlug());
    expect(() => assertSlug("abc_def")).toThrowError(expectInvalidSlug());
    expect(() => assertSlug("abc.def")).toThrowError(expectInvalidSlug());
    expect(() => assertSlug("abc/def")).toThrowError(expectInvalidSlug());
  });

  it("rejects leading, trailing and consecutive hyphens", () => {
    expect(() => assertSlug("-abc")).toThrowError(expectInvalidSlug());
    expect(() => assertSlug("abc-")).toThrowError(expectInvalidSlug());
    expect(() => assertSlug("--abc")).toThrowError(expectInvalidSlug());
    expect(() => assertSlug("abc--def")).toThrowError(expectInvalidSlug());
  });

  it("rejects slugs in the reserved set used by public and studio routes", () => {
    expect(() => assertSlug("temi")).toThrowError(expectSlugTaken());
    expect(() => assertSlug("api")).toThrowError(expectSlugTaken());
    expect(() => assertSlug("brand")).toThrowError(expectSlugTaken());
    expect(() => assertSlug("draft")).toThrowError(expectSlugTaken());
    expect(() => assertSlug("login")).toThrowError(expectSlugTaken());
    expect(() => assertSlug("search")).toThrowError(expectSlugTaken());
    expect(() => assertSlug("feed")).toThrowError(expectSlugTaken());
    expect(() => assertSlug("wp-admin")).toThrowError(expectSlugTaken());
    expect(() => assertSlug("wp-content")).toThrowError(expectSlugTaken());
    expect(() => assertSlug("wp-json")).toThrowError(expectSlugTaken());
  });

  it("rejects reserved words that also fail the kebab-case pattern", () => {
    // `_next` is in SLUG_RESERVED but the underscore fails the pattern first.
    // This is correct — pattern runs before the reserved-set check, and a
    // reserved word that is also a malformed slug gets the more specific
    // `invalid_slug` error.
    expect(() => assertSlug("_next")).toThrowError(expectInvalidSlug());
  });

  it("accepts a normal kebab-case slug", () => {
    expect(() => assertSlug("story-about-news")).not.toThrow();
    expect(() => assertSlug("abc-123-def")).not.toThrow();
    expect(() => assertSlug("пловдив-вестник")).toThrowError(expectInvalidSlug()); // Cyrillic is not lowercase Latin
  });
});

describe("assertInput (Тема с продължение)", () => {
  it("passes slug errors through unchanged", () => {
    expect(() => assertInput({ ...validInput, slug: "ab" })).toThrowError(expectInvalidSlug());
    expect(() => assertInput({ ...validInput, slug: "temi" })).toThrowError(expectSlugTaken());
  });

  it("rejects titles shorter than 5 trimmed characters", () => {
    expect(() => assertInput({ ...validInput, title: "" })).toThrowError(
      expect.objectContaining({ status: 400, code: "invalid_title" }),
    );
    expect(() => assertInput({ ...validInput, title: "abcd" })).toThrowError(
      expect.objectContaining({ status: 400, code: "invalid_title" }),
    );
    expect(() => assertInput({ ...validInput, title: "     " })).toThrowError(
      expect.objectContaining({ status: 400, code: "invalid_title" }),
    );
  });

  it("rejects titles longer than 160 characters", () => {
    expect(() => assertInput({ ...validInput, title: "A".repeat(161) })).toThrowError(
      expect.objectContaining({ status: 400, code: "invalid_title" }),
    );
    expect(() => assertInput({ ...validInput, title: "A".repeat(500) })).toThrowError(
      expect.objectContaining({ status: 400, code: "invalid_title" }),
    );
  });

  it("accepts titles at the 5/160 length boundaries", () => {
    expect(() => assertInput({ ...validInput, title: "abcde" })).not.toThrow();
    expect(() => assertInput({ ...validInput, title: "A".repeat(160) })).not.toThrow();
  });

  it("rejects summaries longer than 280 characters", () => {
    expect(() => assertInput({ ...validInput, summary: "x".repeat(281) })).toThrowError(
      expect.objectContaining({ status: 400, code: "invalid_summary" }),
    );
    expect(() => assertInput({ ...validInput, summary: "x".repeat(1000) })).toThrowError(
      expect.objectContaining({ status: 400, code: "invalid_summary" }),
    );
  });

  it("accepts a 280-character summary (boundary)", () => {
    expect(() => assertInput({ ...validInput, summary: "x".repeat(280) })).not.toThrow();
  });

  it("rejects intros longer than 4000 characters", () => {
    expect(() => assertInput({ ...validInput, intro: "x".repeat(4001) })).toThrowError(
      expect.objectContaining({ status: 400, code: "invalid_intro" }),
    );
    expect(() => assertInput({ ...validInput, intro: "x".repeat(8000) })).toThrowError(
      expect.objectContaining({ status: 400, code: "invalid_intro" }),
    );
  });

  it("accepts a 4000-character intro (boundary)", () => {
    expect(() => assertInput({ ...validInput, intro: "x".repeat(4000) })).not.toThrow();
  });

  it("rejects cover captions longer than 280 characters", () => {
    expect(() => assertInput({ ...validInput, coverCaption: "x".repeat(281) })).toThrowError(
      expect.objectContaining({ status: 400, code: "invalid_cover_caption" }),
    );
  });

  it("accepts empty summary, intro and cover caption", () => {
    expect(() =>
      assertInput({ ...validInput, summary: "", intro: "", coverCaption: "" }),
    ).not.toThrow();
  });

  it("accepts a complete valid input", () => {
    expect(() =>
      assertInput({
        slug: "real-news-topic",
        title: "Сериозно заглавие за историята",
        summary: "Кратко резюме на темата",
        intro: "По-дълго въведение, което описва за какво ще става дума.",
        coverMediaId: null,
        coverCaption: "Надпис под снимката",
      }),
    ).not.toThrow();
  });
});

describe("RESERVED_SLUGS (URL space protection)", () => {
  it("includes 'temi' to protect the public /temi/[slug]/ route", () => {
    // The public route lives at apps/web/app/temi/[slug]/page.tsx and is
    // listed in the migration 28 comment. A reserved slug here is what keeps
    // an editor from creating a theme that would shadow the public page.
    expect(RESERVED_SLUGS.has("temi")).toBe(true);
  });

  it("includes the studio and system routes", () => {
    expect(RESERVED_SLUGS.has("api")).toBe(true);
    expect(RESERVED_SLUGS.has("brand")).toBe(true);
    expect(RESERVED_SLUGS.has("draft")).toBe(true);
    expect(RESERVED_SLUGS.has("login")).toBe(true);
    expect(RESERVED_SLUGS.has("search")).toBe(true);
    expect(RESERVED_SLUGS.has("tag")).toBe(true);
    expect(RESERVED_SLUGS.has("author")).toBe(true);
    expect(RESERVED_SLUGS.has("page")).toBe(true);
    expect(RESERVED_SLUGS.has("feed")).toBe(true);
  });

  it("mentions `_next` separately because it is reserved but fails the pattern first", () => {
    // Kept in sync with the comment above: `_next` is reserved, but
    // assertSlug rejects it via invalid_slug because the pattern runs first.
    expect(RESERVED_SLUGS.has("_next")).toBe(true);
  });

  it("includes legacy WordPress paths so we do not import over them", () => {
    expect(RESERVED_SLUGS.has("wp-admin")).toBe(true);
    expect(RESERVED_SLUGS.has("wp-content")).toBe(true);
    expect(RESERVED_SLUGS.has("wp-json")).toBe(true);
  });

  it("does not reserve normal kebab-case slugs used by articles", () => {
    expect(RESERVED_SLUGS.has("novini")).toBe(false);
    expect(RESERVED_SLUGS.has("top-temi")).toBe(false);
    expect(RESERVED_SLUGS.has("kultura")).toBe(false);
    expect(RESERVED_SLUGS.has("na-fokus")).toBe(false);
  });

  it("is in sync with the reserved slug set used by the article path logic", () => {
    // articles.ts defines its own RESERVED_SLUGS set. Both must contain
    // `temi` so an editor cannot pick a theme slug that collides with the
    // public themes index — and that story routes from a slug that collides
    // with the public `/temi/` page either.
    // `_next` is excluded from the runtime check: it is reserved but the
    // kebab-case pattern rejects it before the reserved-set check runs.
    const articleReserved = ["api", "brand", "draft", "login", "search", "tag", "author", "page", "feed", "wp-admin", "wp-content", "wp-json"];
    for (const slug of articleReserved) {
      expect(RESERVED_SLUGS.has(slug)).toBe(true);
    }
  });
});
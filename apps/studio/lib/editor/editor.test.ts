import { describe, expect, it } from "vitest";
import { articleBody } from "@newspoint/content";
import { bodyToText, textToBody, wordCount } from "./body";
import { draftInput, publishProblems } from "./input";
import { canChangeRole, canDeleteAccount, canManageAccounts } from "./roles";
import { articlePath, slugify, SLUG_MAX, SLUG_PATTERN } from "./slug";

describe("roles", () => {
  const editor = { id: "e1", role: "editor" as const };
  const otherEditor = { id: "e2", role: "editor" as const };
  const admin = { id: "a1", role: "admin" as const };
  const otherAdmin = { id: "a2", role: "admin" as const };
  const master = { id: "m1", role: "master_admin" as const };

  it("lets admins move people between editor and admin, but not editors", () => {
    expect(canChangeRole(admin, editor, "admin")).toBe(true);
    expect(canChangeRole(admin, otherAdmin, "editor")).toBe(true);
    expect(canChangeRole(editor, otherEditor, "admin")).toBe(false);
  });

  it("protects master admins and the actor's own role", () => {
    expect(canChangeRole(admin, master, "editor")).toBe(false);
    expect(canChangeRole(admin, editor, "master_admin")).toBe(false);
    expect(canChangeRole(master, editor, "master_admin")).toBe(false);
    expect(canChangeRole(admin, admin, "editor")).toBe(false);
    expect(canChangeRole(master, admin, "editor")).toBe(true);
  });

  it("lets only the master admin create and delete accounts", () => {
    expect(canManageAccounts("master_admin")).toBe(true);
    expect(canManageAccounts("admin")).toBe(false);
    expect(canDeleteAccount(master, editor)).toBe(true);
    expect(canDeleteAccount(master, master)).toBe(false);
    expect(canDeleteAccount(admin, editor)).toBe(false);
  });
});

describe("slugify", () => {
  it("transliterates Bulgarian like the existing site", () => {
    expect(slugify("Пожарът край Песнопой е потушен")).toBe("pozharat-kray-pesnopoy-e-potushen");
    expect(slugify("Щастие, юнаци и ябълки!")).toBe("shtastie-yunatsi-i-yabalki");
  });

  it("always produces a valid, bounded slug", () => {
    const slug = slugify("Много дълго заглавие ".repeat(20));
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX);
    expect(SLUG_PATTERN.test(slug)).toBe(true);
    expect(slugify("  ?? ")).toBe("");
  });

  it("builds root-level paths", () => {
    expect(articlePath("nova-statiya")).toBe("/nova-statiya/");
  });
});

describe("text body", () => {
  const text = "## Подзаглавие\n\nПърви ред\nвтори ред <b>не</b> & така\n\n> Цитат\n> още\n\n### Малко";

  it("produces blocks the public schema accepts, with markup escaped", () => {
    const body = textToBody(text);
    expect(articleBody.safeParse(body).success).toBe(true);
    expect(body).toEqual([
      { type: "heading", level: 2, text: "Подзаглавие" },
      { type: "paragraph", html: "Първи ред<br>втори ред &lt;b&gt;не&lt;/b&gt; &amp; така" },
      { type: "quote", html: "Цитат<br>още" },
      { type: "heading", level: 3, text: "Малко" },
    ]);
  });

  it("round-trips back to the same text", () => {
    expect(bodyToText(textToBody(text))).toBe(text);
  });

  it("refuses bodies it cannot represent", () => {
    expect(bodyToText([{ type: "legacy_html", html: "<div>x</div>" }])).toBeNull();
  });

  it("ignores blank input and counts words", () => {
    expect(textToBody("\n\n  \n")).toEqual([]);
    expect(wordCount("Две думи — и 3")).toBe(4);
  });
});

describe("draft input", () => {
  const draft = { title: "Заглавие", slug: "zaglavie", excerpt: "", bodyText: "Текст", primaryCategoryId: null, heroMediaId: null };

  it("accepts an empty slug for a new draft and rejects a bad one", () => {
    expect(draftInput.safeParse({ ...draft, slug: "" }).success).toBe(true);
    expect(draftInput.safeParse({ ...draft, slug: "Лош адрес" }).success).toBe(false);
    expect(draftInput.safeParse({ ...draft, extra: 1 }).success).toBe(false);
  });

  it("lists what blocks publication", () => {
    expect(publishProblems({ title: "Заг", slug: "", bodyBlocks: 0, primaryCategoryId: null, heroMediaId: null })).toHaveLength(5);
    expect(
      publishProblems({
        title: "Нормално заглавие",
        slug: "normalno-zaglavie",
        bodyBlocks: 2,
        primaryCategoryId: "0b7c2a44-4f0e-4a61-9d61-2d1f0c6d3a10",
        heroMediaId: "0b7c2a44-4f0e-4a61-9d61-2d1f0c6d3a11",
      }),
    ).toEqual([]);
  });
});

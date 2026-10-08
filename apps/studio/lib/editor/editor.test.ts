import { describe, expect, it } from "vitest";
import { articleBody } from "@newspoint/content";
import { bodyToText, textToBody, wordCount } from "./body";
import { draftInput, publishProblems } from "./input";
import { canChangeRole, canDeleteAccount, canManageAccounts } from "./roles";
import { articlePath, slugify, SLUG_MAX, SLUG_PATTERN } from "./slug";
import { bodyGroups, composition, embedFrameUrl, embedAspectRatio } from "@newspoint/content";
import { bodyToEditorHtml, documentToBody } from "./document";

describe("structured visual document", () => {
  it("protects archive tables and typography inside otherwise editable blocks", () => {
    const body = articleBody.parse([{ type: "paragraph", html: "Формула: H<sub>2</sub>O" }, { type: "list", ordered: false, items: ["<table><tbody><tr><td>Архив</td></tr></tbody></table>"] }]);
    expect(bodyToEditorHtml(body).match(/data-np-legacy=/g)).toHaveLength(2);
    expect(documentToBody({ type: "doc", content: body.map(block => ({ type: "npLegacy", attrs: { block } })) })).toEqual(body);
    expect(bodyToText(body)).toBeNull();
  });
  it("retains only the controlled color classes and strips executable attributes", () => {
    const [block] = articleBody.parse([{ type: "paragraph", html: '<span class="np-text-blue malicious" style="color:red" onclick="alert(1)">Син</span><a href="javascript:alert(1)">линк</a><script>bad</script>' }]);
    expect(block).toEqual({ type: "paragraph", html: '<span class="np-text-blue">Син</span><a>линк</a>' });
  });
  it("keeps underline, strike, colors, heading marks, alignment and dividers", () => {
    const body = documentToBody({ type: "doc", content: [
      { type: "heading", attrs: { level: 4, textAlign: "center", indent: 1 }, content: [{ type: "text", text: "Заглавие", marks: [{ type: "underline" }] }] },
      { type: "paragraph", attrs: { textAlign: "justify" }, content: [{ type: "text", text: "Текст", marks: [{ type: "strike" }, { type: "npColor", attrs: { color: "blue" } }] }] },
      { type: "horizontalRule" },
    ] });
    expect(body[0]).toMatchObject({ level: 4, textAlign: "center", indent: 1, html: "<u>Заглавие</u>" });
    expect(body[1]).toMatchObject({ textAlign: "justify", html: '<span class="np-text-blue"><s>Текст</s></span>' });
    expect(body[2]).toEqual({ type: "divider" });
    expect(bodyToEditorHtml(body)).toContain("<hr>");
  });
  it("preserves protected archive blocks and independent image settings", () => {
    const image = { type: "image" as const, mediaAssetId: "00000000-0000-4000-8000-000000000001", caption: "Надпис", alt: "Точно описание", widthPercent: 40, wrap: "left" as const, cropZoom: 150 };
    const legacy = { type: "legacy_html" as const, html: "<table><tbody><tr><td>Архив</td></tr></tbody></table>" };
    expect(documentToBody({ type: "doc", content: [{ type: "npImage", attrs: { block: image } }, { type: "npLegacy", attrs: { block: legacy } }] })).toEqual([image, legacy]);
  });
  it("does not pull gallery images across intervening text", () => {
    const image = { type: "image" as const, mediaAssetId: "00000000-0000-4000-8000-000000000001", groupId: "gallery" };
    const groups = bodyGroups([image, image, { type: "paragraph", html: "Раздел" }, image]);
    expect(groups.map(group => [group.index, group.blocks.length])).toEqual([[0, 2], [2, 1], [3, 1]]);
    expect(composition({ ...image, widthPercent: 80, wrap: "left" }).className).not.toContain("np-wrap-left");
    expect(composition({ ...image, widthPercent: 40, wrap: "left" }).style).not.toHaveProperty("marginInlineEnd");
  });
  it("rejects arbitrary iframe hosts, normalizes share links and blocks credentials", () => {
    expect(embedFrameUrl("https://youtu.be/dQw4w9WgXcQ")).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    expect(embedFrameUrl("https://facebook.com.evil.test/plugins/video.php")).toBeNull();
    expect(embedFrameUrl("https://user:secret@youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(embedFrameUrl("https://instagram.com/p/example/")).toBeNull();
  });
  it("accepts either body transport and rejects ambiguous or oversized input", () => {
    const draft = { title: "Материал", slug: "material", excerpt: "", primaryCategoryId: null, heroMediaId: null, authorKind: "newsroom", authorUserId: null, authorName: "NewsPoint.bg" };
    expect(draftInput.safeParse({ ...draft, body: [] }).success).toBe(true);
    expect(draftInput.safeParse({ ...draft, body: [], bodyText: "" }).success).toBe(false);
    expect(draftInput.safeParse(draft).success).toBe(false);
    expect(publishProblems({ ...draft, bodyBlocks: 1, primaryCategoryId: "category", heroEmbedUrl: "https://youtu.be/dQw4w9WgXcQ" })).toEqual([]);
  });
  it("bounds Facebook dimensions and rejects credentialed embedded targets", () => {
    const valid = "https://facebook.com/plugins/video.php?href=https%3A%2F%2Ffacebook.com%2Fwatch%2F%3Fv%3D123&width=99999&height=broken";
    expect(embedAspectRatio(valid)).toBe("1200/315");
    expect(embedFrameUrl("https://facebook.com/plugins/post.php?href=https%3A%2F%2Fuser%3Asecret%40facebook.com%2Fposts%2F123")).toBeNull();
    expect(publishProblems({ title: "Материал", slug: "podcast-audio", bodyBlocks: 1, primaryCategoryId: "category", heroMediaId: "media", authorKind: "newsroom", authorName: "NewsPoint.bg" })).toContain("Този адрес е запазен. Изберете друг.");
  });
});

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

  it("supports ordered and unordered list blocks from the toolbar format", () => {
    const source = "- Първа точка\n- Втора точка\n\n1. Първа стъпка\n2. Втора стъпка";
    expect(textToBody(source)).toEqual([
      { type: "list", ordered: false, items: ["Първа точка", "Втора точка"] },
      { type: "list", ordered: true, items: ["Първа стъпка", "Втора стъпка"] },
    ]);
    expect(bodyToText(textToBody(source))).toBe(source);
  });

  it("keeps toolbar inline formatting safe and reversible", () => {
    const source = "**Важно** и *акцент* · [източник](https://newspoint.bg/news/)";
    const body = textToBody(source);
    expect(body[0]).toEqual({ type: "paragraph", html: '<strong>Важно</strong> и <em>акцент</em> · <a href="https://newspoint.bg/news/">източник</a>' });
    expect(bodyToText(body)).toBe(source);
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
  const draft = {
    title: "Заглавие",
    slug: "zaglavie",
    excerpt: "",
    bodyText: "Текст",
    primaryCategoryId: null,
    heroMediaId: null,
    authorKind: "staff" as const,
    authorUserId: "staff-1",
    authorName: "Иван Иванов",
  };

  it("accepts an empty slug for a new draft and rejects a bad one", () => {
    expect(draftInput.safeParse({ ...draft, slug: "" }).success).toBe(true);
    expect(draftInput.safeParse({ ...draft, slug: "Лош адрес" }).success).toBe(false);
    expect(draftInput.safeParse({ ...draft, extra: 1 }).success).toBe(false);
  });

  it("accepts long WordPress-imported slugs that exceed the new-slug cap", () => {
    const wordpressSlug =
      "razchitate-na-waze-za-policzejski-patruli-eto-zastho-lyubimata-vi-opcziya-mozhe-da-vi-podvede";
    expect(wordpressSlug.length).toBeGreaterThan(80);
    expect(draftInput.safeParse({ ...draft, slug: wordpressSlug }).success).toBe(true);
    expect(draftInput.safeParse({ ...draft, slug: `${"a".repeat(201)}` }).success).toBe(false);
  });

  it("validates the three author modes without accepting markup or mismatched profile data", () => {
    expect(draftInput.safeParse({ ...draft, authorKind: "newsroom", authorUserId: null, authorName: "NewsPoint.bg" }).success).toBe(true);
    expect(draftInput.safeParse({ ...draft, authorKind: "manual", authorUserId: null, authorName: "Мария Петрова" }).success).toBe(true);
    expect(draftInput.safeParse({ ...draft, authorKind: "manual", authorUserId: null, authorName: "<script>" }).success).toBe(false);
    expect(draftInput.safeParse({ ...draft, authorKind: "staff", authorUserId: null }).success).toBe(false);
    expect(draftInput.safeParse({ ...draft, authorKind: "newsroom", authorUserId: "staff-1", authorName: "NewsPoint.bg" }).success).toBe(false);
  });

  it("lists what blocks publication", () => {
    expect(
      publishProblems({ title: "Заг", slug: "", bodyBlocks: 0, primaryCategoryId: null, heroMediaId: null, authorKind: "manual", authorName: "" }),
    ).toHaveLength(6);
    expect(
      publishProblems({
        title: "Нормално заглавие",
        slug: "normalno-zaglavie",
        bodyBlocks: 2,
        primaryCategoryId: "0b7c2a44-4f0e-4a61-9d61-2d1f0c6d3a10",
        heroMediaId: "0b7c2a44-4f0e-4a61-9d61-2d1f0c6d3a11",
        authorKind: "newsroom",
        authorName: "NewsPoint.bg",
      }),
    ).toEqual([]);
  });
});

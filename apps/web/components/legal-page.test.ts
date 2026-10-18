import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdirSync, writeFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { LegalPage, legalMetadata } from "./legal-page";
import { LegalFooterLinks, SubmissionLegalNotice } from "./legal-links";
import { LEGAL_DOCUMENTS } from "../lib/legal/documents";
import { LEGAL_EDITION, LEGAL_PATHS, legalReviewPending } from "../lib/legal/types";
import { discoverablePublicPages } from "../lib/public-metadata";
import { llmsText } from "../lib/discovery";

vi.mock("next/link", () => ({ default: ({ href, children, prefetch: _prefetch, ...props }: { href: string; children: unknown; prefetch?: boolean }) => createElement("a", { href, ...props }, children as never) }));
vi.mock("@/lib/public-metadata", async () => await import("../lib/public-metadata"));
vi.mock("@/lib/legal/documents", async () => await import("../lib/legal/documents"));
vi.mock("@/lib/legal/types", async () => await import("../lib/legal/types"));
const original = { ...LEGAL_EDITION };
afterEach(() => { Object.assign(LEGAL_EDITION, original); vi.unstubAllEnvs(); });

for (const document of LEGAL_DOCUMENTS) it(`${document.key}: renders the entire versioned text with unique working contents and cross-document anchors`, () => {
  const html = renderToStaticMarkup(createElement(LegalPage, { document }));
  expect(html.match(/<h1[ >]/g)).toHaveLength(1);
  expect(html).toContain(document.title);
  expect(html).toMatch(/datetime="2026-10-18"/i);
  expect(html).toContain("Версия за преглед");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  expect(new Set(ids).size).toBe(ids.length);
  for (const section of document.sections) {
    expect(ids).toContain(section.id);
    expect(html).toContain(`href="#${section.id}"`);
    for (const paragraph of section.paragraphs ?? []) expect(html).toContain(paragraph);
    for (const item of section.items ?? []) expect(html).toContain(item);
    for (const link of section.links ?? []) if (link.href.startsWith("/") && link.href.includes("#")) {
      const [path, id] = link.href.split("#");
      const target = LEGAL_DOCUMENTS.find(other => other.path === path);
      expect(target?.sections.some(other => other.id === id)).toBe(true);
    }
  }
  expect(html).not.toMatch(/<script|<iframe|<button|lorem ipsum|\[ЕИК\]|\[име на/i);
  if (process.env.LEGAL_QA_REPORT === "1") {
    mkdirSync("tests/reports/legal-pages-20261018", { recursive: true });
    writeFileSync(`tests/reports/legal-pages-20261018/${document.key}.html`, html);
  }
});

it("preserves legacy URL meanings and gives each document its own canonical/OG metadata", () => {
  vi.stubEnv("WEB_URL", "https://newspoint.bg");
  expect(LEGAL_PATHS.terms).toBe("/privacy-policy/");
  expect(LEGAL_PATHS.cookies).toBe("/cookies-policy/");
  for (const document of LEGAL_DOCUMENTS) {
    const metadata = legalMetadata(document);
    expect(metadata.alternates?.canonical).toBe(`https://newspoint.bg${document.path}`);
    expect(metadata.openGraph?.title).toBe(document.title);
    expect(metadata.robots).toMatchObject({ index: false });
  }
});

it("keeps review policies out of public discovery until both publication and an effective date are set", () => {
  const assertExcluded = () => {
    expect(legalReviewPending()).toBe(true);
    for (const path of Object.values(LEGAL_PATHS)) {
      expect(discoverablePublicPages().some(page => page.path === path)).toBe(false);
      expect(llmsText("https://newspoint.bg", [], [])).not.toContain(path);
    }
  };
  assertExcluded();
  LEGAL_EDITION.status = "published";
  assertExcluded();
  LEGAL_EDITION.effectiveAt = "2026-10-19";
  expect(legalReviewPending()).toBe(false);
  for (const path of Object.values(LEGAL_PATHS)) {
    expect(discoverablePublicPages().some(page => page.path === path)).toBe(true);
    expect(llmsText("https://newspoint.bg", [], [])).toContain(path);
  }
});

it("links the three policies and preserves unsent form state by opening notices in a separate tab", () => {
  const footer = renderToStaticMarkup(createElement(LegalFooterLinks));
  for (const path of Object.values(LEGAL_PATHS)) expect(footer).toContain(`href="${path}"`);
  for (const kind of ["report", "my-news"] as const) {
    const html = renderToStaticMarkup(createElement(SubmissionLegalNotice, { kind }));
    expect(html).toContain(`${LEGAL_PATHS.personalData}#reports`);
    expect(html).toContain(`${LEGAL_PATHS.terms}#submissions`);
    expect(html.match(/target="_blank"/g)).toHaveLength(2);
    expect(html.match(/rel="noopener"/g)).toHaveLength(2);
    expect(html).not.toContain('type="checkbox"');
  }
});

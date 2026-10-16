import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ClampedTitleTip } from "./clamped-title-tip";

vi.mock("./reader-preferences", () => ({ useReducedMotion: () => true }));

describe("clamped news title server rendering", () => {
  it.each(["h1", "h2", "h3"] as const)("keeps the full %s link text without a native title or pre-hydration tooltip", (as) => {
    const title = "Изрично тестово заглавие с пълен текст за достъпното име на линка";
    const html = renderToString(createElement("a", { href: "/test-only/" },
      createElement(ClampedTitleTip, { as, className: "line-clamp-2", children: title }),
    ));
    expect(html).toBe(`<a href="/test-only/"><${as} class="line-clamp-2">${title}</${as}></a>`);
  });
});

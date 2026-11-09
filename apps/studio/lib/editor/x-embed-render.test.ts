import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { XPostEmbed } from "../../components/x-post-embed";

describe("X preview in authenticated Studio", () => {
  it("shows an explicit load control before mounting the external widget", () => {
    const html = renderToStaticMarkup(createElement(XPostEmbed, { src: "https://x.com/TouchlineX/status/218292706224988444" }));
    expect(html).toContain("Зареди преглед от X");
    expect(html).toContain("Виж публикацията в X");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("platform.x.com");
  });
});

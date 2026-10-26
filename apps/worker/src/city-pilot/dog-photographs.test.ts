import { expect, it } from "vitest";
import { parsePilotPage } from "./parse";
it("associates a shelter photo with the same directory/profile and refuses another shelter", () => {
  const fixture = (host: string) => `<div id="adoption-gallery"><div class="dog-post-container"><div class="dog-image"><a href="https://${host}/shelter/uploads/plovdivd_shelter/123/real.JPG"><img></a></div><div class="dog-information"><dl><dt>Порода:</dt><dd>Fixture breed</dd></dl><dl><dt>Пол:</dt><dd>женско</dd></dl><dl><dt>Размер:</dt><dd>средно</dd></dl><dl><dt>Цвят:</dt><dd>кафяво</dd></dl><div class="dog-description">Explicit test profile</div></div></div></div>`;
  const item = parsePilotPage("plovdiv-dog-shelter", fixture("register-dogs.com")).items[0]!;
  expect(item.key).toBe("123"); expect(item.fields.imageUrl).toBe("https://www.register-dogs.com/shelter/uploads/plovdivd_shelter/123/real.JPG");
  expect(() => parsePilotPage("plovdiv-dog-shelter", fixture("foreign.example"))).toThrow();
  const redirected = fixture("register-dogs.com").replace("/123/real.JPG", "/123/../999/real.JPG");
  expect(parsePilotPage("plovdiv-dog-shelter", redirected).items[0]?.fields.imageUrl).toBeUndefined();
});

import { expect, it } from "vitest";
import { wordpressVariants } from "./media-variants";

it("uses only reported same-origin proportional WordPress sizes", () => {
  const result = wordpressVariants({ id: 1, source_url: "https://newspoint.bg/wp-content/uploads/a.jpg", media_details: {
    width: 1600, height: 900, sizes: {
      square: { source_url: "https://newspoint.bg/wp-content/uploads/square.jpg", width: 150, height: 150 },
      medium: { source_url: "https://newspoint.bg/wp-content/uploads/medium.jpg", width: 640, height: 360 },
      injected: { source_url: "https://another.test/fake.jpg", width: 960, height: 540 },
    },
  } });
  expect(result.map(item => item.width)).toEqual([640, 1600]);
  expect(result[0]?.url).toBe("https://newspoint.bg/wp-content/uploads/medium.jpg");
});

it("does not infer filenames when WordPress supplies no sizes", () => {
  expect(wordpressVariants({ id: 1, source_url: "https://newspoint.bg/a.jpg" })).toEqual([]);
});

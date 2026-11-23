import { describe, expect, it } from "vitest";
import { mobileFeedPending } from "./mobile-feed-readiness";

describe("mobile canonical geometry readiness", () => {
  it("stays pending with an available model until that model's tail fallback is removed", () => {
    let pending = true;
    const wrapper = { querySelector: () => pending ? { marker: "canonical-tail" } : null };
    const script = { parentElement: wrapper };
    const main = { querySelector: () => script } as unknown as Pick<ParentNode, "querySelector">;
    expect(mobileFeedPending(main)).toBe(true);
    pending = false;
    expect(mobileFeedPending(main)).toBe(false);
  });

  it("ignores pending preview content outside the canonical model wrapper", () => {
    const script = { parentElement: { querySelector: () => null } };
    const main = { querySelector: (selector: string) => selector === "[data-mobile-rubric-model]" ? script : { marker: "preview-tail" } } as unknown as Pick<ParentNode, "querySelector">;
    expect(mobileFeedPending(main)).toBe(false);
  });

  it("leaves the existing missing-model handling to the pager", () => {
    const main = { querySelector: () => null };
    expect(mobileFeedPending(main)).toBe(false);
  });
});

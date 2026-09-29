import { describe, expect, it } from "vitest";
import { PUBLIC_MENU, menuName } from "./menu";

describe("public menu", () => {
  it("lists the rubrics in the agreed order, each once", () => {
    expect(PUBLIC_MENU.map((entry) => entry.slug)).toEqual([
      "plovdiv",
      "regionalni-novini",
      "balgariya",
      "politika",
      "kriminalni-novini",
      "ot-soczialnite-mrezhi",
      "svetovni-novini",
      "sportni-novini",
      "tehnologii",
      "biznes-novini",
      "zdrave",
      "kultura",
      "lajfstajl",
      "izbori",
      "glasat-na-istinata",
    ]);
    expect(new Set(PUBLIC_MENU.map((entry) => entry.slug)).size).toBe(PUBLIC_MENU.length);
  });

  it("renames imported labels and leaves the rest", () => {
    expect(menuName("lajfstajl", "Любопитно")).toBe("Лайфстайл");
    expect(menuName("biznes-novini", "Икономика")).toBe("Бизнес");
    expect(menuName("regionalni-novini", "Регионални")).toBe("Регион");
    expect(menuName("novini", "Новини")).toBe("Новини");
  });
});

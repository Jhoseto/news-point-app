import { describe, expect, it } from "vitest";
import { PUBLIC_MENU, menuName, mobileRubricsMenuOrder } from "./menu";

describe("public menu", () => {
  it("lists the rubrics in the agreed order, each once", () => {
    expect(PUBLIC_MENU.map((entry) => entry.slug)).toEqual([
      "plovdiv",
      "regionalni-novini",
      "na-fokus",
      "glasat-na-istinata",
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
    ]);
    expect(new Set(PUBLIC_MENU.map((entry) => entry.slug)).size).toBe(PUBLIC_MENU.length);
  });

  it("puts analyses directly above Bulgaria in the mobile/PWA drawer only", () => {
    const source = PUBLIC_MENU.map((entry) => ({ ...entry, path: `/${entry.slug}/` }));
    const unchanged = source.map((entry) => entry.slug);
    const ordered = mobileRubricsMenuOrder(source);
    expect(ordered.map((entry) => entry.slug).slice(0, 6)).toEqual([
      "plovdiv",
      "regionalni-novini",
      "na-fokus",
      "glasat-na-istinata",
      "ot-soczialnite-mrezhi",
      "balgariya",
    ]);
    expect(ordered).toHaveLength(source.length);
    expect(new Set(ordered.map((entry) => entry.slug)).size).toBe(source.length);
    expect(source.map((entry) => entry.slug)).toEqual(unchanged);
    expect(mobileRubricsMenuOrder([{ slug: "balgariya" }])).toEqual([{ slug: "balgariya" }]);
    expect(mobileRubricsMenuOrder(ordered)).toEqual(ordered);
  });

  it("renames imported labels and leaves the rest", () => {
    expect(menuName("lajfstajl", "Любопитно")).toBe("Лайфстайл");
    expect(menuName("biznes-novini", "Икономика")).toBe("Бизнес");
    expect(menuName("regionalni-novini", "Регионални")).toBe("Регион");
    expect(menuName("novini", "Новини")).toBe("Новини");
    expect(menuName("na-fokus", "На фокус")).toBe("На Фокус");
  });
});

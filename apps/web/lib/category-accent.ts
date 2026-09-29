import type { CSSProperties } from "react";

const CATEGORY_ACCENTS: Record<string, string> = {
  plovdiv: "#1396a3",
  "regionalni-novini": "#26936e",
  balgariya: "#5142d5",
  politika: "#7650c8",
  "kriminalni-novini": "#d57546",
  "ot-soczialnite-mrezhi": "#b75f9c",
  "svetovni-novini": "#3b78d1",
  "sportni-novini": "#289b65",
  tehnologii: "#2794b4",
  "biznes-novini": "#b58533",
  zdrave: "#299c82",
  kultura: "#a365c1",
  lajfstajl: "#ca6999",
  izbori: "#7566d6",
  "glasat-na-istinata": "#3818d6",
};

export function categoryAccentStyle(slug: string | undefined): CSSProperties {
  return { "--np-category-accent": (slug && CATEGORY_ACCENTS[slug]) || "var(--np-accent)" } as CSSProperties;
}

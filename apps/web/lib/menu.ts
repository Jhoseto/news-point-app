export { PUBLIC_MENU, menuName } from "@newspoint/content";

/** Phone/PWA rubrics drawer order, without changing the desktop/global menu. */
export function mobileRubricsMenuOrder<T extends { slug: string }>(items: readonly T[]): T[] {
  const ordered = [...items];
  const analysesIndex = ordered.findIndex((item) => item.slug === "ot-soczialnite-mrezhi");
  const bulgariaIndex = ordered.findIndex((item) => item.slug === "balgariya");
  if (analysesIndex < 0 || bulgariaIndex < 0 || analysesIndex < bulgariaIndex) return ordered;
  const [analyses] = ordered.splice(analysesIndex, 1);
  if (analyses) ordered.splice(bulgariaIndex, 0, analyses);
  return ordered;
}

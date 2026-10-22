/** Originals keep the complete archive. Only the invisible loop suffix is
 * bounded: cover the visible seam plus two viewport widths of drag travel. */
export function carouselCloneCount(articleCount: number, viewportWidth: number, stripWidth: number): number {
  if (articleCount < 2 || !Number.isFinite(viewportWidth) || viewportWidth <= 0 || !Number.isFinite(stripWidth) || stripWidth <= 0) return 0;
  const step = stripWidth / articleCount;
  return Math.min(articleCount, Math.ceil(3 * viewportWidth / step) + 2);
}

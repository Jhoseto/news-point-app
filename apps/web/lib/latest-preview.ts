/** Viewport rectangles for the desktop "Последни новини" hover card. */

export type LatestRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
};

export type LatestFlyout = {
  cardLeft: number;
  cardTop: number;
  cardWidth: number;
  cardHeight: number;
  anchorY: number;
  connectorLeft: number;
  connectorWidth: number;
  backdropLeft: number;
  backdropTop: number;
  backdropWidth: number;
  backdropHeight: number;
};

const GAP = 12;
const MIN_STAGE = 220;
const MIN_CARD = 240;
const MAX_CARD = 320;
const MAX_CARD_HEIGHT = 544;

function px(value: number): number {
  return Math.round(value);
}

/**
 * Places one card in the column marked as the stage, just left of the panel.
 * The same numbers are used on the homepage band and on the taller rubric/article rail.
 * Returns null when that column is too narrow to hold a card.
 */
export function measureLatestFlyout(input: {
  stage: LatestRect;
  panel: LatestRect;
  link: LatestRect;
  viewportHeight: number;
}): LatestFlyout | null {
  const { stage, panel, link, viewportHeight } = input;
  if (stage.width < MIN_STAGE || panel.width <= 0 || viewportHeight <= 0) return null;

  const cardWidth = px(Math.min(MAX_CARD, Math.max(MIN_CARD, Math.min(stage.width - 24, panel.width * 0.78))));
  const cardHeight = px(Math.min(panel.height, viewportHeight * 0.56, MAX_CARD_HEIGHT));
  if (cardWidth < MIN_CARD || cardHeight < 120) return null;

  const cardLeft = px(panel.left - GAP - cardWidth);
  const anchorY = px(link.top + link.height / 2);
  const cardTop = px(Math.max(panel.top, Math.min(panel.bottom - cardHeight, anchorY - cardHeight / 2)));

  return {
    cardLeft,
    cardTop,
    cardWidth,
    cardHeight,
    anchorY,
    connectorLeft: cardLeft + cardWidth,
    connectorWidth: Math.max(0, px(panel.left - (cardLeft + cardWidth))),
    backdropLeft: px(stage.left),
    backdropTop: px(panel.top),
    backdropWidth: px(stage.width),
    backdropHeight: px(panel.height),
  };
}

/** The hovered row still intersects the panel's own scroller. */
export function isLatestRowVisible(link: LatestRect, scroller: LatestRect): boolean {
  return link.bottom > scroller.top + 1 && link.top < scroller.bottom - 1;
}

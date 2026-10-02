/** Minimum loop length even when there are few cards. */
export const SHINE_CYCLE_MIN_S = 90;
/** Extra time after the last card’s delay for the sweep to finish. */
export const SHINE_CYCLE_TAIL_S = 5;
/** Delay between consecutive cards in the same section (left → right). */
export const SHINE_STAGGER_S = 0.58;
/** Random pause before each section/category block starts. */
export const SHINE_SECTION_GAP_MIN_S = 5;
export const SHINE_SECTION_GAP_MAX_S = 14;

export type HomeShineAllocator = {
  nextCard: () => number;
  sectionBreak: () => void;
  maxDelaySec: () => number;
};

function randomSectionGapSec() {
  const span = SHINE_SECTION_GAP_MAX_S - SHINE_SECTION_GAP_MIN_S;
  return SHINE_SECTION_GAP_MIN_S + Math.random() * span;
}

export function createHomeShine(): HomeShineAllocator {
  let nextDelaySec = 0;
  let maxDelaySec = 0;
  return {
    nextCard() {
      const delay = nextDelaySec;
      maxDelaySec = Math.max(maxDelaySec, delay);
      nextDelaySec += SHINE_STAGGER_S;
      return delay;
    },
    sectionBreak() {
      nextDelaySec += randomSectionGapSec();
    },
    maxDelaySec() {
      return maxDelaySec;
    },
  };
}

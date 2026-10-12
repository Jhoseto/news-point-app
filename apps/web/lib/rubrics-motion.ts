/** Snap layout once, then move the page and utility strip together on the compositor. */
export const RUBRICS_MOTION_MS = 380;
export const RUBRICS_MOTION_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

export function createRubricsMotion(document: Document) {
  const animations = new Set<Animation>();
  const play = (element: HTMLElement, frames: Keyframe[]) => {
    const animation = element.animate(frames, { duration: RUBRICS_MOTION_MS, easing: RUBRICS_MOTION_EASING });
    animations.add(animation);
    animation.onfinish = () => animations.delete(animation);
  };
  const cancel = () => {
    for (const animation of animations) animation.cancel();
    animations.clear();
  };

  return {
    cancel,
    move(expanded: boolean, reducedMotion: boolean) {
      const elements = [...document.querySelectorAll<HTMLElement>("[data-rubrics-motion]")];
      const canvas = document.querySelector<HTMLElement>(".np-rubrics-nav");
      const clipBefore = canvas ? document.defaultView?.getComputedStyle(canvas).clipPath : undefined;
      // Capture the current visual position before cancelling: rapid reversals stay continuous.
      const positions = elements.map(element => {
        const rect = element.getBoundingClientRect();
        return { x: rect.left, y: rect.top };
      });
      cancel();
      document.documentElement.toggleAttribute("data-rubrics-closed", !expanded);
      if (reducedMotion) return;

      // Batch all layout reads before starting any animations. No per-frame JS or width animation.
      const offsets = elements.map((element, index) => {
        const rect = element.getBoundingClientRect();
        return { x: positions[index]!.x - rect.left, y: positions[index]!.y - rect.top };
      });
      const clipAfter = canvas ? document.defaultView?.getComputedStyle(canvas).clipPath : undefined;
      elements.forEach((element, index) => {
        const offset = offsets[index]!;
        if (Math.abs(offset.x) < 0.5 && Math.abs(offset.y) < 0.5) return;
        play(element, [{ translate: `${offset.x}px ${offset.y}px` }, { translate: "0px 0px" }]);
      });
      // Use the same clock for the edge and content, including mid-flight reversals.
      if (canvas && clipBefore && clipAfter && clipBefore !== clipAfter) {
        play(canvas, [{ clipPath: clipBefore }, { clipPath: clipAfter }]);
      }
    },
  };
}

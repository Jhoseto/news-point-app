import { describe, expect, it, vi } from "vitest";
import { createRubricsMotion } from "./rubrics-motion";

function browser(vertical = false) {
  let expanded = true;
  const nodes = [264, 276].map(openLeft => {
    let translation = 0;
    let translationY = 0;
    const active: { cancel: ReturnType<typeof vi.fn>; onfinish: (() => void) | null }[] = [];
    const element = {
      getBoundingClientRect: () => ({ left: (expanded ? openLeft : openLeft - 206) + translation, top: (vertical ? (expanded ? 100 : 134) : 0) + translationY }),
      animate: vi.fn((frames: { translate: string }[]) => {
        translation = parseFloat(frames[0]!.translate);
        translationY = parseFloat(frames[0]!.translate.split(" ")[1]!);
        const animation = { cancel: vi.fn(() => { translation = 0; translationY = 0; }), onfinish: null as (() => void) | null };
        active.push(animation);
        return animation;
      }),
    };
    return { element, active, advance: (remaining: number) => { translation *= remaining; translationY *= remaining; } };
  });
  const root = {
    toggleAttribute: vi.fn((_attribute: string, closed: boolean) => { expanded = !closed; }),
  };
  const document = { documentElement: root, querySelectorAll: () => nodes.map(node => node.element), querySelector: () => null } as unknown as Document;
  return { nodes, root, controller: createRubricsMotion(document) };
}

describe("desktop rubric movement", () => {
  it("keeps the page and strip in their previous visual position when layout changes", () => {
    const { controller, nodes } = browser();
    const before = nodes.map(node => node.element.getBoundingClientRect().left);
    controller.move(false, false);
    expect(nodes.map(node => node.element.getBoundingClientRect().left)).toEqual(before);
  });

  it("reverses from an interrupted position without a jump or stacked animations", () => {
    const { controller, nodes } = browser();
    controller.move(false, false);
    nodes.forEach(node => node.advance(0.4));
    const before = nodes.map(node => node.element.getBoundingClientRect().left);
    controller.move(true, false);
    expect(nodes.map(node => node.element.getBoundingClientRect().left)).toEqual(before);
    nodes.forEach(node => expect(node.active[0]!.cancel).toHaveBeenCalledOnce());
    controller.cancel();
    nodes.forEach(node => expect(node.active[1]!.cancel).toHaveBeenCalledOnce());
  });

  it("immediately settles interrupted movement when reduced motion is requested", () => {
    const { controller, nodes } = browser();
    controller.move(false, false);
    controller.move(true, true);
    expect(nodes.map(node => node.element.getBoundingClientRect().left)).toEqual([264, 276]);
    nodes.forEach(node => {
      expect(node.element.animate).toHaveBeenCalledOnce();
      expect(node.active[0]!.cancel).toHaveBeenCalledOnce();
    });
  });

  it("does not retain completed animations", () => {
    const { controller, nodes } = browser();
    controller.move(false, false);
    nodes.forEach(node => { node.advance(0); node.active[0]!.onfinish?.(); });
    controller.cancel();
    nodes.forEach(node => expect(node.active[0]!.cancel).not.toHaveBeenCalled());
  });

  it("does not animate unchanged positions", () => {
    const { controller, nodes } = browser();
    controller.move(true, false);
    nodes.forEach(node => expect(node.element.animate).not.toHaveBeenCalled());
  });

  it("preserves vertical position when the compact home group stacks, including reversal", () => {
    const { controller, nodes } = browser(true);
    controller.move(false, false);
    expect(nodes.map(node => node.element.getBoundingClientRect().top)).toEqual([100, 100]);
    nodes.forEach(node => node.advance(0.4));
    const before = nodes.map(node => node.element.getBoundingClientRect().top);
    controller.move(true, false);
    expect(nodes.map(node => node.element.getBoundingClientRect().top)).toEqual(before);
  });
});

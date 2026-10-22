import { describe, expect, it, vi } from "vitest";
import { controllerUpdateHandler } from "./service-worker-update";

describe("reader service worker controller updates", () => {
  it("keeps first-install claim on the current page, then reloads a real update once", () => {
    let controller: object | null = null;
    const reload = vi.fn();
    const change = controllerUpdateHandler(null, () => controller, reload);
    change();
    controller = {}; change(); change();
    expect(reload).not.toHaveBeenCalled();
    controller = {}; change(); change();
    controller = {}; change();
    expect(reload).toHaveBeenCalledOnce();
  });
  it("still refreshes existing installed readers when their controller is replaced", () => {
    let controller: object | null = {};
    const reload = vi.fn();
    const change = controllerUpdateHandler(controller, () => controller, reload);
    change(); controller = null; change();
    expect(reload).not.toHaveBeenCalled();
    controller = {}; change();
    expect(reload).toHaveBeenCalledOnce();
  });
});

import { expect, it, vi } from "vitest";
import * as C from "cesium";
import { CesiumTrafficLayer } from "./cesium-traffic-layer";

it("preserves traffic point proportions across resize, repeated updates and rebuilding roads", async () => {
  let collection: C.PointPrimitiveCollection | null = null;
  const viewer = {
    isDestroyed: () => false,
    camera: { positionCartographic: { height: 1200 } },
    scene: {
      sampleHeightSupported: false,
      requestRender: vi.fn(),
      primitives: {
        add: (value: C.PointPrimitiveCollection) => { collection = value; return value; },
        remove: (value: C.PointPrimitiveCollection) => { value.destroy(); return true; },
      },
    },
  } as unknown as C.Viewer;
  // Explicit CPU-only road fixture; no network, map provider or database.
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ roads: [
    { coordinates: [[24.74, 42.13], [24.75, 42.14]], type: "primary", oneway: 0 },
  ] }) })));
  const layer = new CesiumTrafficLayer(viewer, C);
  const points = () => collection as unknown as C.PointPrimitiveCollection;
  try {
    await layer.refreshRoads([]);
    expect(points().length).toBeGreaterThan(0);
    const original = points().get(0).pixelSize;
    layer.setPixelScale(0.5);
    expect(points().get(0).pixelSize).toBe(original * 0.5);
    layer.setPixelScale(0.5);
    expect(points().get(0).pixelSize).toBe(original * 0.5);
    layer.setPixelScale(0.75);
    expect(points().get(0).pixelSize).toBe(original * 0.75);
    await layer.refreshRoads([]);
    expect(points().get(0).pixelSize).toBe(original * 0.75);
    layer.setPixelScale(1);
    expect(points().get(0).pixelSize).toBe(original);
  } finally {
    layer.dispose();
    vi.unstubAllGlobals();
  }
});

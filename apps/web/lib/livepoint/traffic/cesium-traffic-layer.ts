import type { TrafficIncident } from "../types";
import {
  DOT_HEIGHT_OFFSET_M,
  DOT_SIZE_BY_TYPE,
  MAX_DOTS,
  SPEED_MPS,
  allocateRoadDotBudgets,
  flowSpeedScale,
  incidentPathsAsSimRoads,
  osmRecordsAsSimRoads,
  simplifyRoadCoords,
  type FlowBucket,
  type SimRoad,
} from "./traffic-simulation";
import type { OverpassRoad } from "./overpass-roads";

type CesiumModule = typeof import("cesium");

type ParsedRoad = SimRoad & {
  waypoints: import("cesium").Cartesian3[];
  segmentDist: number[];
};

type TrafficDot = {
  point: import("cesium").PointPrimitive;
  road: ParsedRoad;
  waypoints: import("cesium").Cartesian3[];
  segmentDist: number[];
  numSegments: number;
  segIdx: number;
  t: number;
  mps: number;
  direction: 1 | -1;
  stoppedUntil: number;
};

const BUCKET_COLORS: Record<FlowBucket, string> = {
  free: "#2ecc71",
  slow: "#f0b23e",
  jam: "#e05252",
};

function bucketColor(C: CesiumModule, bucket: FlowBucket | null) {
  if (!bucket) return C.Color.WHITE.withAlpha(0.85);
  return C.Color.fromCssColorString(BUCKET_COLORS[bucket]).withAlpha(0.92);
}

function dotPixelSize(road: ParsedRoad, bucket: FlowBucket | null): number {
  const base = DOT_SIZE_BY_TYPE[road.type] ?? 4;
  return base + (bucket === "jam" ? 1 : 0);
}

/** Animated traffic dots along OSM roads + TomTom incident corridors (gods-eye-view style). */
export class CesiumTrafficLayer {
  private readonly scratch = { lerp: null as import("cesium").Cartesian3 | null };
  private collection: import("cesium").PointPrimitiveCollection | null = null;
  private dots: TrafficDot[] = [];
  private roads: ParsedRoad[] = [];
  private lastAnimTime = 0;
  private tickListener: (() => void) | null = null;
  private enabled = false;
  private loading = false;
  private osmRoads: OverpassRoad[] | null = null;

  constructor(
    private readonly viewer: import("cesium").Viewer,
    private readonly C: CesiumModule,
  ) {
    this.scratch.lerp = new C.Cartesian3();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.collection) this.collection.show = on;
    if (on && this.dots.length === 0 && !this.loading) void this.refreshRoads([]);
    this.syncClock(on);
  }

  dispose() {
    this.syncClock(false);
    if (this.collection && !this.viewer.isDestroyed()) {
      this.viewer.scene.primitives.remove(this.collection);
    }
    this.collection = null;
    this.dots = [];
    this.roads = [];
  }

  async refreshRoads(incidents: Pick<TrafficIncident, "id" | "path" | "category" | "delaySec">[]) {
    if (this.viewer.isDestroyed()) return;
    this.loading = true;
    try {
      if (this.osmRoads === null) {
        try {
          const response = await fetch("/api/livepoint/traffic/roads/", { cache: "no-store" });
          if (response.ok) {
            const body = (await response.json()) as { roads?: OverpassRoad[] };
            this.osmRoads = body.roads ?? [];
          } else {
            this.osmRoads = [];
          }
        } catch {
          this.osmRoads = [];
        }
      }

      const simRoads: SimRoad[] = [
        ...incidentPathsAsSimRoads(incidents),
        ...osmRecordsAsSimRoads(this.osmRoads),
      ];
      this.rebuildDots(simRoads);
    } finally {
      this.loading = false;
    }
  }

  private parseRoad(road: SimRoad): ParsedRoad | null {
    const coords = simplifyRoadCoords(road.coords);
    if (coords.length < 2) return null;

    let baseHeight = 0;
    const first = coords[0]!;
    if (this.viewer.scene.sampleHeightSupported) {
      const carto = this.C.Cartographic.fromDegrees(first[0], first[1]);
      const sampled = this.viewer.scene.sampleHeight(carto);
      if (Number.isFinite(sampled)) baseHeight = sampled!;
    }

    const waypoints = coords.map(([lon, lat]) =>
      this.C.Cartesian3.fromDegrees(lon, lat, baseHeight + DOT_HEIGHT_OFFSET_M),
    );
    const segmentDist: number[] = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
      segmentDist.push(this.C.Cartesian3.distance(waypoints[i]!, waypoints[i + 1]!));
    }

    return { ...road, coords, waypoints, segmentDist };
  }

  private rebuildDots(simRoads: SimRoad[]) {
    if (this.viewer.isDestroyed()) return;
    if (this.collection) {
      this.collection.removeAll();
      this.viewer.scene.primitives.remove(this.collection);
    }

    this.dots = [];
    this.roads = simRoads.flatMap((road) => {
      const parsed = this.parseRoad(road);
      return parsed ? [parsed] : [];
    });

    const collection = this.viewer.scene.primitives.add(new this.C.PointPrimitiveCollection());
    this.collection = collection;
    collection.show = this.enabled;

    const altitude = this.viewer.camera.positionCartographic.height;
    const filtered =
      altitude > 5000
        ? this.roads.filter((road) => road.type === "motorway" || road.type === "trunk" || road.type === "primary")
        : this.roads;

    const budgets = allocateRoadDotBudgets(filtered, altitude, MAX_DOTS);
    for (let i = 0; i < filtered.length; i++) {
      const budget = budgets[i] ?? 0;
      if (budget > 0) this.spawnDotsForRoad(filtered[i]!, budget);
      if (this.dots.length >= MAX_DOTS) break;
    }

    this.viewer.scene.requestRender();
  }

  private spawnDotsForRoad(road: ParsedRoad, count: number) {
    const numSegments = road.waypoints.length - 1;
    if (numSegments < 1 || count <= 0 || road.closure) return;

    const bucket = road.bucket;
    const typeSpeed = SPEED_MPS[road.type] ?? 5;

    for (let i = 0; i < count; i++) {
      if (this.dots.length >= MAX_DOTS || !this.collection) return;
      const segIdx = Math.floor(Math.random() * numSegments);
      const t = Math.random();
      const noisedMps = typeSpeed * (0.7 + Math.random() * 0.6);
      const mps = noisedMps * flowSpeedScale(bucket);
      const direction: 1 | -1 = road.oneway ? (road.oneway as 1 | -1) : i % 2 === 0 ? 1 : -1;

      this.C.Cartesian3.lerp(road.waypoints[segIdx]!, road.waypoints[segIdx + 1]!, t, this.scratch.lerp!);
      const point = this.collection.add({
        position: this.C.Cartesian3.clone(this.scratch.lerp!),
        pixelSize: dotPixelSize(road, bucket),
        color: bucketColor(this.C, bucket),
        scaleByDistance: new this.C.NearFarScalar(100, 1.5, Math.max(8000, this.viewer.camera.positionCartographic.height * 1.5), bucket === "jam" ? 0.55 : 0.3),
        translucencyByDistance: new this.C.NearFarScalar(100, 1, Math.max(10_000, this.viewer.camera.positionCartographic.height * 1.8), 0),
        disableDepthTestDistance: bucket === "jam" ? 15_000 : 2000,
      });

      this.dots.push({
        point,
        road,
        waypoints: road.waypoints,
        segmentDist: road.segmentDist,
        numSegments,
        segIdx,
        t,
        mps,
        direction,
        stoppedUntil: 0,
      });
    }
  }

  private animate = () => {
    if (!this.enabled || this.dots.length === 0) return;
    const now = Date.now();
    const dt = this.lastAnimTime ? Math.min((now - this.lastAnimTime) / 1000, 0.1) : 0.016;
    this.lastAnimTime = now;

    for (const dot of this.dots) {
      if (now < dot.stoppedUntil) continue;
      const segLen = dot.segmentDist[dot.segIdx] || 1;
      const tDelta = (dot.mps * dt) / segLen;
      dot.t += tDelta * dot.direction;

      if (dot.t >= 1) {
        dot.t -= 1;
        dot.segIdx += 1;
        if (dot.segIdx >= dot.numSegments) {
          dot.segIdx = 0;
          dot.t = Math.random() * 0.3;
        }
        this.maybeStopLight(dot, now);
      } else if (dot.t <= 0) {
        dot.t += 1;
        dot.segIdx -= 1;
        if (dot.segIdx < 0) {
          dot.segIdx = dot.numSegments - 1;
          dot.t = 1 - Math.random() * 0.3;
        }
        this.maybeStopLight(dot, now);
      }

      const a = dot.waypoints[dot.segIdx]!;
      const b = dot.waypoints[dot.segIdx + 1]!;
      this.C.Cartesian3.lerp(a, b, dot.t, this.scratch.lerp!);
      dot.point.position = this.scratch.lerp!;
    }

    this.viewer.scene.requestRender();
  };

  private maybeStopLight(dot: TrafficDot, now: number) {
    const nearEnd = dot.segIdx <= 1 || dot.segIdx >= dot.numSegments - 2;
    if (nearEnd && Math.random() < 0.008) dot.stoppedUntil = now + 2000 + Math.random() * 4000;
  }

  private syncClock(on: boolean) {
    if (on && !this.tickListener) {
      this.tickListener = this.animate;
      this.viewer.clock.onTick.addEventListener(this.tickListener);
      this.viewer.clock.shouldAnimate = true;
    } else if (!on && this.tickListener) {
      this.viewer.clock.onTick.removeEventListener(this.tickListener);
      this.tickListener = null;
    }
  }
}

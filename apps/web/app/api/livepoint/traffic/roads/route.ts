import { NextResponse } from "next/server";
import { isTomTomConfigured, PLOVDIV_TRAFFIC_BBOX } from "@/lib/livepoint/config";
import { normalizeOverpassRoads, overpassRoadQuery } from "@/lib/livepoint/traffic/overpass-roads";

export const dynamic = "force-dynamic";

const CACHE_MS = 6 * 60 * 60_000;
const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";

type RoadsCache = {
  fetchedAt: number;
  roads: ReturnType<typeof normalizeOverpassRoads>;
};

declare global {
  // eslint-disable-next-line no-var
  var __npPlovdivRoadsCache: RoadsCache | undefined;
}

function parseBbox(bbox: string): { west: number; south: number; east: number; north: number } {
  const parts = bbox.split(",").map((value) => Number(value.trim()));
  if (parts.length !== 4 || !parts.every(Number.isFinite)) {
    throw new TypeError("Invalid traffic bbox");
  }
  const [west, south, east, north] = parts as [number, number, number, number];
  return { west, south, east, north };
}

export async function GET() {
  if (!isTomTomConfigured()) {
    return NextResponse.json(
      { status: "not_connected", message: "Traffic roads unavailable without TomTom session.", roads: [] },
      { status: 200, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const cached = globalThis.__npPlovdivRoadsCache;
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) {
    return NextResponse.json(
      {
        status: "ok",
        source: "openstreetmap/overpass",
        fetchedAt: new Date(cached.fetchedAt).toISOString(),
        roads: cached.roads,
      },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  }

  const { west, south, east, north } = parseBbox(PLOVDIV_TRAFFIC_BBOX);
  const query = overpassRoadQuery(south, west, north, east);

  try {
    const response = await fetch(OVERPASS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      cache: "no-store",
    });
    if (!response.ok) {
      if (cached) {
        return NextResponse.json(
          {
            status: "stale",
            source: "openstreetmap/overpass",
            message: "Overpass temporarily unavailable; serving cached roads.",
            fetchedAt: new Date(cached.fetchedAt).toISOString(),
            roads: cached.roads,
          },
          { headers: { "Cache-Control": "private, no-store" } },
        );
      }
      return NextResponse.json(
        { status: "unavailable", message: "Road geometry unavailable.", roads: [] },
        { status: 503, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const payload = (await response.json()) as { elements?: unknown[] };
    const roads = normalizeOverpassRoads(payload);
    const fetchedAt = Date.now();
    globalThis.__npPlovdivRoadsCache = { fetchedAt, roads };

    return NextResponse.json(
      {
        status: "ok",
        source: "openstreetmap/overpass",
        fetchedAt: new Date(fetchedAt).toISOString(),
        roads,
      },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch {
    if (cached) {
      return NextResponse.json(
        {
          status: "stale",
          source: "openstreetmap/overpass",
          message: "Network error; serving cached roads.",
          fetchedAt: new Date(cached.fetchedAt).toISOString(),
          roads: cached.roads,
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    return NextResponse.json(
      { status: "unavailable", message: "Road geometry unavailable.", roads: [] },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

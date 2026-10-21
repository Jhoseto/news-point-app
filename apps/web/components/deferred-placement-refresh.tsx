"use client";

import dynamic from "next/dynamic";

const PlacementRefresh = dynamic(
  () => import("./placement-refresh").then((module) => module.PlacementRefresh),
  { ssr: false },
);

export function DeferredPlacementRefresh({ nextChangeAt }: { nextChangeAt: number | null }) {
  return <PlacementRefresh nextChangeAt={nextChangeAt} />;
}

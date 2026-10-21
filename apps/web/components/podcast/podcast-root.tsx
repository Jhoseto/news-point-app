"use client";

import type { ReactNode } from "react";
import { PodcastProvider } from "./provider";

/** Podcast playback context only on podcast routes — not the public homepage bundle. */
export function PodcastRoot({ children }: { children: ReactNode }) {
  return <PodcastProvider>{children}</PodcastProvider>;
}

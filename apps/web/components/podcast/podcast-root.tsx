"use client";

import type { ReactNode } from "react";
import { PodcastProvider } from "./provider";

/** One audio engine for the public site, retained by the shared root layout. */
export function PodcastRoot({ children }: { children: ReactNode }) {
  return <PodcastProvider>{children}</PodcastProvider>;
}

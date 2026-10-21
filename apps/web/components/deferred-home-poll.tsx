"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { afterCriticalPageLoad } from "@/lib/deferred-page-work";
import type { ComponentProps } from "react";
import type { HomePoll } from "./home-poll";

const Poll = dynamic(() => import("./home-poll").then((module) => module.HomePoll), { ssr: false, loading: () => null });

type Props = ComponentProps<typeof HomePoll>;

/** Below-the-fold poll: keep JS/CSS out of the initial mobile homepage chunk. */
export function DeferredHomePoll(props: Props) {
  const [ready, setReady] = useState(false);
  useEffect(() => afterCriticalPageLoad(() => setReady(true), 0, { skipConstrained: false }), []);
  if (!ready) return null;
  return <Poll {...props} />;
}

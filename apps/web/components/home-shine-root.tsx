import type { CSSProperties, ReactNode } from "react";

/** Server-rendered CSS timing for the homepage card shine. */
export function HomeShineRoot({ children, cycleSec, mobileHidden = false }: { children: ReactNode; cycleSec: number; mobileHidden?: boolean }) {
  return (
    <div
      className={`np-home-shine${mobileHidden ? " np-mobile-legacy-feed" : ""}`}
      style={{ "--np-shine-cycle": `${cycleSec}s` } as CSSProperties}
    >
      {children}
    </div>
  );
}

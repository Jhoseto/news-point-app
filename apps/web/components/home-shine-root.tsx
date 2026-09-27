import type { CSSProperties, ReactNode } from "react";

/** Server-rendered CSS timing for the homepage card shine. */
export function HomeShineRoot({ children, cycleSec }: { children: ReactNode; cycleSec: number }) {
  return (
    <div
      className="np-home-shine"
      style={{ "--np-shine-cycle": `${cycleSec}s` } as CSSProperties}
    >
      {children}
    </div>
  );
}

import type { ReactNode } from "react";

/**
 * Mobile shell wrapper. Children are not passed through a client boundary so the
 * feed HTML is not duplicated inside the RSC flight payload.
 */
export function MobileFeedBoundary({ children }: { children: ReactNode; ssrDesktop?: boolean }) {
  return (
    <>
      <div data-np-mobile-shell className="contents">
        {children}
      </div>
    </>
  );
}

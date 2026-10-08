import type { ReactNode } from "react";
import { ViewportShellGate } from "./viewport-shell-gate";

/**
 * Mobile shell wrapper. Children are not passed through a client boundary so the
 * feed HTML is not duplicated inside the RSC flight payload.
 */
export function MobileFeedBoundary({ children, ssrDesktop = false }: { children: ReactNode; ssrDesktop?: boolean }) {
  return (
    <>
      <ViewportShellGate shell="mobile" ssrDesktop={ssrDesktop} />
      <div data-np-mobile-shell className="contents">
        {children}
      </div>
    </>
  );
}

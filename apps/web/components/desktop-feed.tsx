import type { ReactNode } from "react";
import { ViewportShellGate } from "./viewport-shell-gate";

/**
 * Desktop homepage/category shell. Children stay Server Components in the HTML;
 * only a tiny client gate can remove the shell on viewport mismatch.
 */
export function DesktopFeed({ children, ssrDesktop = true }: { children: ReactNode; ssrDesktop?: boolean }) {
  return (
    <>
      <ViewportShellGate shell="desktop" ssrDesktop={ssrDesktop} />
      <div data-np-desktop-shell className="contents">
        {children}
      </div>
    </>
  );
}

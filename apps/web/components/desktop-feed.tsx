import type { ReactNode } from "react";

/**
 * Desktop homepage/category shell. Children stay Server Components in the HTML;
 * The root layout refreshes this exclusive shell on viewport mismatch.
 */
export function DesktopFeed({ children }: { children: ReactNode; ssrDesktop?: boolean }) {
  return (
    <>
      <div data-np-desktop-shell className="contents">
        {children}
      </div>
    </>
  );
}

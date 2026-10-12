"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import { handleRubricMenuClick } from "./category-archive-pagination";
import { useReducedMotion } from "./reader-preferences";

export function RubricChipLink({ href, onClick, ...props }: ComponentProps<typeof Link>) {
  const pathname = usePathname() ?? "/";
  const reducedMotion = useReducedMotion();
  return (
    <Link
      {...props}
      href={href}
      onClick={(event) => {
        handleRubricMenuClick(event, typeof href === "string" ? href : pathname, pathname, reducedMotion);
        onClick?.(event);
      }}
    />
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import { handleRubricMenuClick } from "./category-archive-pagination";

export function RubricChipLink({ href, onClick, ...props }: ComponentProps<typeof Link>) {
  const pathname = usePathname() ?? "/";
  return (
    <Link
      {...props}
      href={href}
      onClick={(event) => {
        handleRubricMenuClick(event, typeof href === "string" ? href : event.currentTarget.pathname, pathname);
        onClick?.(event);
      }}
    />
  );
}

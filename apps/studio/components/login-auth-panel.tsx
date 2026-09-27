import type { ReactNode } from "react";
import { BrandLogoImg } from "@/components/brand-logo-img";

/** Right column shared by login, forgot-password and reset-password. */
export function LoginAuthPanel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="relative flex items-center justify-center px-5 py-12 sm:px-10">
      <div className="np-gradient-bg pointer-events-none absolute -top-48 right-0 size-[30rem] rounded-full opacity-[0.08] blur-3xl lg:hidden" aria-hidden="true" />
      <div className="relative w-full max-w-[25rem]">
        <BrandLogoImg className="mb-10 h-11 w-auto max-w-[11rem] object-contain object-left lg:hidden" />
        <h1 className="text-4xl font-extrabold tracking-tight text-ink">{title}</h1>
        <p className="mt-2 text-[0.9375rem] text-muted">{description}</p>
        {children}
      </div>
    </section>
  );
}

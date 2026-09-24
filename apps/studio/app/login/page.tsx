import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { withBase } from "@/lib/paths";
import { getStaff } from "@/lib/session";

export const metadata: Metadata = { title: "Вход" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getStaff()) redirect("/");
  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <section className="relative hidden overflow-hidden bg-shell text-white lg:flex lg:flex-col lg:justify-between lg:p-14">
        <div className="np-login-orb np-login-orb-a" aria-hidden="true" />
        <div className="np-login-orb np-login-orb-b" aria-hidden="true" />
        <div className="np-login-grid" aria-hidden="true" />
        <img src={withBase("/brand/newspoint-logo-dark.webp")} alt="NewsPoint.bg" width={220} height={62} className="relative h-14 w-auto self-start" />
        <div className="relative max-w-lg">
          <p className="text-xs font-extrabold tracking-[0.25em] text-white/60 uppercase">Studio · редакция</p>
          <h2 className="mt-4 text-5xl leading-[1.05] font-extrabold tracking-tight">
            Новините,
            <br />
            <span className="np-login-gradient-text">в реално време.</span>
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-white/70">Управление на редакцията. Преглед и публикации на статии.</p>
        </div>
        <p className="relative flex items-center gap-2 text-sm text-white/50">
          <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <rect x="4" y="10" width="16" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
          Достъп само за редакцията. Всеки вход се проверява.
        </p>
      </section>

      <section className="relative flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="np-gradient-bg pointer-events-none absolute -top-48 right-0 size-[30rem] rounded-full opacity-[0.08] blur-3xl lg:hidden" aria-hidden="true" />
        <div className="relative w-full max-w-[25rem]">
          <img src={withBase("/brand/newspoint-logo.webp")} alt="NewsPoint.bg" width={180} height={50} className="mb-10 h-11 w-auto lg:hidden" />
          <h1 className="text-4xl font-extrabold tracking-tight text-ink">Studio NewsPoint</h1>
          <p className="mt-2 text-[0.9375rem] text-muted">Влезте с профила, който ви е дал администраторът.</p>
          <LoginForm />
          <p className="mt-10 text-xs leading-relaxed text-faint">
            След 5 грешни опита профилът се заключва за 15 минути. Сесията изтича след 12 часа.
          </p>
        </div>
      </section>
    </main>
  );
}

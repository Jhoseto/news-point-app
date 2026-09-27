import { withBase } from "@/lib/paths";

export function LoginHero() {
  return (
    <section className="relative hidden overflow-hidden bg-shell text-white lg:flex lg:flex-col lg:justify-between lg:p-14">
      <div className="np-login-orb np-login-orb-a" aria-hidden="true" />
      <div className="np-login-orb np-login-orb-b" aria-hidden="true" />
      <div className="np-login-grid" aria-hidden="true" />
      <img src={withBase("/brand/newspoint-logo.webp")} alt="NewsPoint.bg" width={980} height={312} className="relative h-14 w-auto max-w-[14rem] object-contain object-left self-start" />
      <div className="relative max-w-lg">
        <p className="text-xs font-extrabold tracking-[0.25em] text-white/60 uppercase">Studio · редакция</p>
        <h2 className="mt-4 text-5xl leading-[1.05] font-extrabold tracking-tight">
          Новините,
          <br />
          <span className="np-login-gradient-text">в реално време.</span>
        </h2>
        <p className="mt-6 text-lg leading-relaxed text-white/70">Административна зона. Управление на редакцията. Преглед и публикации на статии.</p>
      </div>
      <p className="relative flex items-center gap-2 text-sm text-white/50">
        <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <rect x="4" y="10" width="16" height="11" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
        Класифициран достъп само за служители на редакцията. Всеки вход се проверява.
      </p>
    </section>
  );
}

import Link from "next/link";

export const metadata = {
  title: "Няма връзка",
  robots: { index: false, follow: false },
};

/**
 * Offline fallback used by the service worker when there is no network and no
 * cached page. Server-rendered, no data dependencies.
 */
export default function OfflinePage() {
  return (
    <div className="np-container flex min-h-[60vh] flex-col items-center justify-center gap-5 py-12 text-center">
      <div className="np-ring !size-12" aria-hidden="true" />
      <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Няма връзка с интернет</h1>
      <p className="max-w-md text-body">
        Тази страница не е налична офлайн. Проверете връзката с интернет и опитайте отново.
      </p>
      <Link
        href="/"
        prefetch={false}
        className="np-gradient-bg inline-flex min-h-11 items-center rounded-full px-5 py-2.5 text-sm font-bold text-on-accent"
      >
        Към началната страница
      </Link>
    </div>
  );
}

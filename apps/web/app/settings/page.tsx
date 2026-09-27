import type { Metadata } from "next";
import { SettingsPanel } from "@/components/settings-panel";

export const metadata: Metadata = { title: "Настройки на четене", robots: { index: false, follow: true } };

export default function SettingsPage() {
  return (
    <div className="np-container py-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <p className="mb-3 flex items-center gap-2 text-xs font-bold tracking-widest text-accent uppercase dark:text-link"><span className="np-ring" aria-hidden="true" />Вашият NewsPoint</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Настройки на четене</h1>
        <p className="mt-3 mb-8 max-w-xl text-sm leading-relaxed text-muted">Персонализирайте изгледа за удобно четене. Не е необходим профил — изборът е само за това устройство.</p>
        <SettingsPanel />
      </div>
    </div>
  );
}

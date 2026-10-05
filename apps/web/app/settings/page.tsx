import type { Metadata } from "next";
import { SettingsPanel } from "@/components/settings-panel";

export const metadata: Metadata = { title: "Настройки", robots: { index: false, follow: true } };

export default function SettingsPage() {
  return (
    <div className="np-container py-8 sm:py-12">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Настройки</h1>
        <p className="mt-2 mb-6 max-w-xl text-sm leading-relaxed text-muted">Изглед, движение и нотификации — само за това устройство.</p>
        <SettingsPanel compact />
      </div>
    </div>
  );
}

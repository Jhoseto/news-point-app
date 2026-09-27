import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginAuthPanel } from "@/components/login-auth-panel";
import { LoginForm } from "@/components/login-form";
import { LoginHero } from "@/components/login-hero";
import { getStaff } from "@/lib/session";

export const metadata: Metadata = { title: "Вход" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getStaff()) redirect("/");
  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <LoginHero />
      <LoginAuthPanel title="Studio NewsPoint" description="Влезте с профила, който ви е дал администраторът.">
        <LoginForm />
        <p className="mt-10 text-xs leading-relaxed text-faint">
          След 5 грешни опита профилът се заключва за 15 минути. Сесията изтича след 12 часа.
        </p>
      </LoginAuthPanel>
    </main>
  );
}

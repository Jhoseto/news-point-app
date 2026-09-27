import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginAuthPanel } from "@/components/login-auth-panel";
import { LoginHero } from "@/components/login-hero";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { getStaff } from "@/lib/session";

export const metadata: Metadata = { title: "Нова парола" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  if (await getStaff()) redirect("/");
  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <LoginHero />
      <LoginAuthPanel title="Нова парола" description="Задайте нова парола според правилата на редакцията.">
        <Suspense fallback={<p className="mt-8 text-sm text-muted">Зареждане…</p>}>
          <ResetPasswordForm />
        </Suspense>
      </LoginAuthPanel>
    </main>
  );
}

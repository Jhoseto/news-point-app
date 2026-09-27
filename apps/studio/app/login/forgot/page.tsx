import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { LoginAuthPanel } from "@/components/login-auth-panel";
import { LoginHero } from "@/components/login-hero";
import { getStaff } from "@/lib/session";

export const metadata: Metadata = { title: "Забравена парола" };
export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  if (await getStaff()) redirect("/");
  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <LoginHero />
      <LoginAuthPanel title="Забравена парола" description="Ще изпратим връзка на имейла ви, ако профилът съществува в Studio.">
        <ForgotPasswordForm />
      </LoginAuthPanel>
    </main>
  );
}

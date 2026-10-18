import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/session";
import { facebookSettings } from "@/lib/social-facebook";
import { SocialConnection } from "@/components/social-connection";
export const dynamic = "force-dynamic";
export const metadata = { title: "Facebook" };
export default async function SocialSettings({ searchParams }: { searchParams: Promise<{ selection?: string; error?: string }> }) {
  const staff = await requireStaff(); if (staff.role !== "master_admin") notFound();
  const params = await searchParams; const settings = await facebookSettings(staff, params.selection);
  return <div className="p-4 sm:p-6">{params.error && <p role="alert" className="mb-3 text-sm">Свързването с Facebook не успя или не бяха разрешени всички права. Опитайте отново.</p>}
    <SocialConnection {...settings} selection={params.selection ?? ""} enabled={process.env.SOCIAL_PUBLISHING_ENABLED === "1"} />
  </div>;
}

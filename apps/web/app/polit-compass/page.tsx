import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { localCompassAllowed } from "./access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Политически компас", robots: { index: false, follow: false } };

export default async function PoliticalCompassPage() {
  if (!localCompassAllowed(await headers())) notFound();
  const { default: CompassApp } = await import("../../../../polit-compass/components/CompassApp");
  return (
    <div className="np-container flex flex-col gap-4 pt-3 pb-10 lg:gap-8 lg:pt-5">
      <Breadcrumbs items={[{ name: "Политически компас" }]} />
      <CompassApp />
    </div>
  );
}

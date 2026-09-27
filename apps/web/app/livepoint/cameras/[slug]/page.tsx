import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CameraLiveEmbed } from "@/components/livepoint/camera-live-embed";
import { canPlayInApp, getCamera, CAMERA_CATALOG } from "@/lib/livepoint/cameras/catalog";

export function generateStaticParams() {
  return CAMERA_CATALOG.map((camera) => ({ slug: camera.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const camera = getCamera(slug);
  return { title: camera ? `${camera.name} · Камери` : "Камера" };
}

export default async function LivePointCameraDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const camera = getCamera(slug);
  if (!camera) notFound();

  const nearby = CAMERA_CATALOG.filter((item) => item.slug !== camera.slug && item.category === camera.category).slice(0, 3);

  return (
    <div className="np-container max-w-3xl py-8">
      <nav className="mb-4 text-sm">
        <Link href="/" className="font-semibold text-link">
          Начало
        </Link>
        <span className="text-muted"> / </span>
        <Link href="/livepoint/cameras/" className="font-semibold text-link">
          Камери
        </Link>
        <span className="text-muted"> / {camera.name}</span>
      </nav>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">{camera.name}</h1>
      <p className="mt-2 text-sm text-muted">
        {camera.place}
        {camera.direction ? ` · ${camera.direction}` : ""}
      </p>
      {canPlayInApp(camera) && camera.embedUrl ? (
        <div className="mt-4">
          <CameraLiveEmbed title={camera.name} embedUrl={camera.embedUrl} sourceUrl={camera.sourceUrl} />
        </div>
      ) : (
        <p className="mt-4 text-sm text-body">Потокът не е наличен в приложението.</p>
      )}
      {nearby.length ? (
        <section className="mt-10">
          <h2 className="text-lg font-extrabold text-ink">Близки камери</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {nearby.map((item) => (
              <li key={item.slug}>
                <Link href={`/livepoint/cameras/${item.slug}/`} className="font-semibold text-link">
                  {item.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

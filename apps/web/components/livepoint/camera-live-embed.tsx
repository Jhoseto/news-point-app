"use client";

import { useEffect, useState } from "react";
import { cameraEmbedPlayUrl } from "@/lib/livepoint/cameras/embed-play-url";

function isRefreshingSnapUrl(url: string): boolean {
  return /\.jpe?g(\?|$)/i.test(url) || url.includes("/snap.jpg");
}

function CameraSnapImage({ title, src }: { title: string; src: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const refreshSrc = tick ? `${src}${src.includes("?") ? "&" : "?"}t=${tick}` : src;

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-line bg-black shadow-card">
      {/* eslint-disable-next-line @next/next/no-img-element -- public JPEG refresh streams, not in our CDN */}
      <img src={refreshSrc} alt={title} className="absolute inset-0 size-full object-cover" />
    </div>
  );
}

export function CameraLiveEmbed({ title, embedUrl, sourceUrl, eager = false }: {
  title: string;
  embedUrl: string;
  sourceUrl: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const src = cameraEmbedPlayUrl(embedUrl);

  if (isRefreshingSnapUrl(embedUrl)) {
    return <CameraSnapImage title={title} src={embedUrl} />;
  }

  if (failed) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center rounded-2xl border border-line bg-surface-2 px-4 text-center">
        <p className="text-sm text-body">Потокът не се зареди в приложението.</p>
        <a href={sourceUrl} target="_blank" rel="noreferrer" className="mt-2 text-sm font-semibold text-link">
          Отвори при източника ↗
        </a>
      </div>
    );
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-line bg-black shadow-card">
      <iframe
        key={src}
        title={title}
        src={src}
        className="absolute inset-0 size-full border-0"
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        referrerPolicy="no-referrer-when-downgrade"
        loading={eager ? "eager" : "lazy"}
        onLoad={() => setFailed(false)}
      />
    </div>
  );
}

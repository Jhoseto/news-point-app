"use client";

import { useEffect, useRef, useState } from "react";
import { cameraEmbedPlayUrl } from "../../lib/livepoint/cameras/embed-play-url";
import { isCameraSnapshot, type CameraPlaybackState } from "../../lib/livepoint/cameras/playback-state";
import { useCookieConsent } from "../cookie-consent-store";
import { CookieSettingsButton } from "../cookie-settings-button";

type CameraPlayerProps = {
  title: string;
  embedUrl: string;
  sourceUrl?: string;
  eager?: boolean;
  kind?: "iframe" | "snapshot";
  onPlaybackState?: (state: CameraPlaybackState) => void;
};

function CameraFeed({ title, embedUrl, kind, onPlaybackState }: CameraPlayerProps) {
  const snapshot = kind === "snapshot" || isCameraSnapshot(embedUrl);
  const manualPlay = new URL(embedUrl).hostname === "rtsp.me";
  const fixedAspect = new URL(embedUrl).hostname === "webcams.pamporovo.me";
  const [attempt, setAttempt] = useState(0);
  const [stamp, setStamp] = useState(0);
  const [state, setState] = useState<CameraPlaybackState>("loading");
  const deadline = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusListener = useRef(onPlaybackState);

  useEffect(() => { statusListener.current = onPlaybackState; }, [onPlaybackState]);
  useEffect(() => { statusListener.current?.(state); }, [state]);
  useEffect(() => {
    const armDeadline = () => {
      if (deadline.current) clearTimeout(deadline.current);
      deadline.current = setTimeout(() => setState("unavailable"), 18_000);
    };
    setState("loading");
    armDeadline();
    if (snapshot) setStamp(Date.now());
    const timer = snapshot ? setInterval(() => {
      if (document.hidden) return;
      setStamp(Date.now());
      armDeadline();
    }, 30_000) : null;
    return () => {
      if (deadline.current) clearTimeout(deadline.current);
      if (timer) clearInterval(timer);
    };
  }, [snapshot, attempt]);

  const loaded = () => {
    if (deadline.current) clearTimeout(deadline.current);
    // A cross-origin iframe load does not prove that its video is playing.
    setState("ready");
  };
  const failed = () => {
    if (deadline.current) clearTimeout(deadline.current);
    setState("unavailable");
  };
  const imageUrl = stamp ? embedUrl + (embedUrl.includes("?") ? "&" : "?") + "t=" + stamp : embedUrl;

  return (
    <div className="np-camera-embed relative flex aspect-video min-h-0 w-full flex-col overflow-hidden bg-[#050b22] text-white">
      <div className="relative min-h-0 flex-1" style={{ containerType: "size" }}>
        {snapshot ? (
          // eslint-disable-next-line @next/next/no-img-element -- public refresh images retain their original aspect ratio and timestamp
          <img src={imageUrl} alt={title} className="absolute inset-0 size-full object-contain" onLoad={loaded} onError={failed} />
        ) : (
          <iframe key={attempt} title={title} src={cameraEmbedPlayUrl(embedUrl)} className="absolute inset-0 size-full border-0"
            style={fixedAspect ? { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: "min(100%, calc(100cqh * 16 / 9))", height: "min(100%, calc(100cqw * 9 / 16))" } : undefined}
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin"
            loading="eager" onLoad={loaded} onError={failed} />
        )}
        {state === "loading" && <div role="status" className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#050b22]/80 text-sm">Свързване с камерата…</div>}
        {state === "unavailable" && (
          <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#050b22] p-4 text-center">
            <p className="text-sm">В момента няма картина от тази камера.</p>
            <button type="button" onClick={() => setAttempt((value) => value + 1)} className="min-h-11 rounded-lg bg-white px-4 text-sm font-semibold text-slate-900">Опитай отново</button>
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 px-3 text-xs text-white/75">
        <p>{snapshot ? "Обновявани снимки. Картината се обновява автоматично." : manualPlay ? "Натиснете Play във видеото, за да тръгне камерата." : "Ако видеото не тръгне автоматично, натиснете Play."}</p>
        <button type="button" onClick={() => setAttempt((value) => value + 1)} className="min-h-11 shrink-0 px-1 font-semibold text-white hover:underline">Презареди</button>
      </div>
    </div>
  );
}

export function CameraLiveEmbed(props: CameraPlayerProps) {
  const allowed = useCookieConsent().record?.external === true;
  if (!allowed) return (
    <div className="np-camera-embed np-camera-consent flex aspect-video min-h-0 w-full flex-col items-center justify-center gap-3 bg-surface-2 p-5 text-center">
      <p className="text-sm font-semibold text-heading">Разрешете външното съдържание, за да видите камерата.</p>
      <p className="max-w-sm text-xs leading-relaxed text-muted">Видеото се зарежда от оператора на камерата след вашето съгласие.</p>
      <CookieSettingsButton className="min-h-11 rounded-lg border border-line px-4 text-sm font-semibold text-heading hover:bg-surface" />
    </div>
  );
  return <CameraFeed key={props.embedUrl} {...props} />;
}

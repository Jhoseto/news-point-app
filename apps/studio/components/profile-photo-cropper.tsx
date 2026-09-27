"use client";

import { useEffect, useRef, useState } from "react";

/** Local preview only. The server validates and re-encodes the resulting file. */
export function ProfilePhotoCropper({ file, busy, onCancel, onSave }: { file: File; busy: boolean; onCancel: () => void; onSave: (file: File) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLImageElement | null>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
    const url = URL.createObjectURL(file);
    const photo = new Image();
    photo.onload = () => {
      if (photo.naturalWidth * photo.naturalHeight > 25_000_000) { setError("Изберете снимка до 25 мегапиксела."); return; }
      image.current = photo;
      setReady(true);
    };
    photo.onerror = () => setError("Снимката не може да бъде отворена.");
    photo.src = url;
    return () => { photo.onload = null; photo.onerror = null; URL.revokeObjectURL(url); };
  }, [file]);

  const bounds = (x: number, y: number, scale = zoom) => {
    const photo = image.current;
    if (!photo) return { x: 0, y: 0 };
    const ratio = Math.max(320 / photo.naturalWidth, 320 / photo.naturalHeight) * scale;
    const maxX = (photo.naturalWidth * ratio - 320) / 2;
    const maxY = (photo.naturalHeight * ratio - 320) / 2;
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  };

  useEffect(() => {
    const photo = image.current;
    const context = canvas.current?.getContext("2d");
    if (!photo || !context) return;
    const scale = Math.max(320 / photo.naturalWidth, 320 / photo.naturalHeight) * zoom;
    context.clearRect(0, 0, 320, 320);
    context.drawImage(photo, (320 - photo.naturalWidth * scale) / 2 + position.x, (320 - photo.naturalHeight * scale) / 2 + position.y, photo.naturalWidth * scale, photo.naturalHeight * scale);
  }, [zoom, position, ready]);

  async function save() {
    const photo = image.current;
    if (!photo) return;
    const output = document.createElement("canvas");
    output.width = output.height = 512;
    const context = output.getContext("2d");
    if (!context) return;
    const scale = Math.max(320 / photo.naturalWidth, 320 / photo.naturalHeight) * zoom;
    const sourceSize = 320 / scale;
    const left = (photo.naturalWidth - sourceSize) / 2 - position.x / scale;
    const top = (photo.naturalHeight - sourceSize) / 2 - position.y / scale;
    context.drawImage(photo, left, top, sourceSize, sourceSize, 0, 0, 512, 512);
    const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, "image/webp", 0.95));
    if (!blob) { setError("Снимката не може да бъде обработена."); return; }
    await onSave(new File([blob], "profile.webp", { type: "image/webp" }));
  }

  return <dialog ref={dialog} aria-labelledby="crop-heading" onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }} className="m-auto w-[min(28rem,calc(100vw-1.5rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-shell/70 backdrop:backdrop-blur-sm">
    <div className="flex items-center justify-between border-b border-line px-5 py-4"><h2 id="crop-heading" className="font-extrabold">Настройте профилната снимка</h2><button type="button" disabled={busy} onClick={onCancel} aria-label="Затвори" className="size-9 rounded-lg hover:bg-surface-2">×</button></div>
    <div className="space-y-4 p-5">
      <p className="text-sm text-muted">Преместете снимката и приближете, за да изберете какво да се вижда.</p>
      <div className="relative mx-auto aspect-square w-full max-w-80 overflow-hidden rounded-xl bg-surface-2">
        <canvas ref={canvas} width={320} height={320} tabIndex={0} aria-label="Изрязване на снимката. Използвайте стрелките за местене." className="h-full w-full touch-none cursor-grab outline-none focus:ring-4 focus:ring-accent/30 active:cursor-grabbing"
          onPointerDown={(event) => { if (busy) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, left: position.x, top: position.y }; }}
          onPointerMove={(event) => { if (!drag.current) return; const ratio = 320 / event.currentTarget.getBoundingClientRect().width; setPosition(bounds(drag.current.left + (event.clientX - drag.current.x) * ratio, drag.current.top + (event.clientY - drag.current.y) * ratio)); }}
          onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
          onKeyDown={(event) => { const moves: Record<string, [number, number]> = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] }; const move = moves[event.key]; if (move && !busy) { event.preventDefault(); setPosition(bounds(position.x + move[0], position.y + move[1])); } }} />
        <div className="pointer-events-none absolute inset-0 rounded-full border-2 border-white/90 shadow-[0_0_0_80px_rgb(0_0_0/0.45)]" aria-hidden="true" />
      </div>
      <div className="flex items-center gap-3"><label htmlFor="photo-zoom" className="text-xs font-bold text-muted">Zoom</label><input id="photo-zoom" type="range" min={1} max={3} step={0.01} value={zoom} disabled={!ready || busy} onChange={(event) => { const next = Number(event.target.value); setZoom(next); setPosition(bounds(position.x, position.y, next)); }} className="min-w-0 flex-1 accent-violet-600" /><button type="button" disabled={busy} onClick={() => { setZoom(1); setPosition({ x: 0, y: 0 }); }} className="text-xs font-bold text-accent">Нулирай</button></div>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-line pt-4"><button type="button" disabled={busy} onClick={onCancel} className="np-btn np-btn-secondary">Отказ</button><button type="button" disabled={!ready || busy || Boolean(error)} onClick={() => void save()} className="np-btn np-btn-primary">{busy ? "Записване…" : "Запази снимката"}</button></div>
    </div>
  </dialog>;
}

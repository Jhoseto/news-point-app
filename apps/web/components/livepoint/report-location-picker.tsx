"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { coordinateLabel, requestDeviceLocation, type ReportLocation, type ReportPosition } from "@/lib/livepoint/forms/location";
import { CloseIcon, PinIcon } from "../icons";
import { TextField } from "./livepoint-field";
import { ReportLocationMap } from "./report-location-map";

export function ReportLocationPicker({ initial, onConfirm, onClose }: { initial: ReportLocation | null; onConfirm: (location: ReportLocation) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const alive = useRef(true);
  const manualAddress = useRef(false);
  const gpsRequest = useRef(0);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  const [point, setPoint] = useState<ReportPosition | null>(initial?.position ?? null);
  const [focusPoint, setFocusPoint] = useState<ReportPosition | null>(null);
  const [address, setAddress] = useState(initial?.place ?? "");
  const [lookupPoint, setLookupPoint] = useState<ReportPosition | null>(null);
  const [addressPending, setAddressPending] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [gpsPending, setGpsPending] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);

  useEffect(() => {
    alive.current = true;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
    return () => {
      alive.current = false;
      dialog.current?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (!lookupPoint) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/livepoint/report/location/", { method: "POST", cache: "no-store", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(lookupPoint) });
        const data = await response.json() as { address?: string | null; error?: string };
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error(data.error || "Адресът не е достъпен.");
        if (!manualAddress.current && data.address) setAddress(data.address);
        if (!data.address) setAddressError("Не е намерен адрес за тази точка. Може да уточните мястото ръчно.");
      } catch (error) {
        if (!controller.signal.aborted) setAddressError(error instanceof Error ? error.message : "Адресът не е достъпен. Точката остава избрана.");
      } finally { if (!controller.signal.aborted) setAddressPending(false); }
    }, 650);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [lookupPoint]);

  function selectPoint(next: ReportPosition) {
    gpsRequest.current += 1;
    setGpsPending(false);
    setPoint(next);
    setAddress("");
    setAddressError(null);
    setGpsError(null);
    setAccuracy(null);
    manualAddress.current = false;
    setAddressPending(true);
    setLookupPoint(next);
  }

  async function locate() {
    if (gpsPending) return;
    setGpsError(null);
    if (!window.isSecureContext || !navigator.geolocation) {
      setGpsError("Браузърът не поддържа местоположение тук. Посочете точката ръчно.");
      return;
    }
    setGpsPending(true);
    const requestId = ++gpsRequest.current;
    try {
      const result = await requestDeviceLocation(navigator.geolocation);
      if (!alive.current || requestId !== gpsRequest.current) return;
      selectPoint(result.point);
      setFocusPoint(result.point);
      setAccuracy(result.accuracy);
    } catch (error) {
      if (!alive.current || requestId !== gpsRequest.current) return;
      setGpsPending(false);
      setGpsError(error instanceof Error ? error.message : "Местоположението не е достъпно. Посочете точката ръчно.");
    }
  }

  return createPortal(
    <dialog
      ref={dialog}
      data-report-location-dialog
      aria-labelledby={titleId}
      className="np-report-location-dialog m-auto max-h-[calc(100dvh_-_1.5rem)] w-[calc(100vw_-_1.5rem)] max-w-3xl overflow-hidden rounded-3xl border border-line bg-surface p-0 text-ink shadow-[0_28px_100px_rgb(0_0_0/0.35)]"
      onCancel={event => { event.preventDefault(); closeRef.current(); }}
      onKeyDown={event => {
        if (event.key !== "Tab") return;
        const items = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]')].filter(item => item.offsetParent !== null);
        const first = items[0], last = items.at(-1);
        if (!first || !last) return;
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeRef.current();
      }}
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3 sm:px-6 sm:py-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"><PinIcon width={21} height={21} /></span>
        <div className="min-w-0 flex-1"><h2 id={titleId} className="text-base font-extrabold sm:text-lg">Къде се случва?</h2><p className="mt-0.5 text-xs text-muted">Посочете точното място на сигнала.</p></div>
        <button type="button" autoFocus aria-label="Затвори картата" onClick={onClose} className="flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-muted"><CloseIcon width={18} height={18} /></button>
      </div>
      <div className="np-scroll-soft min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="max-w-sm text-xs leading-relaxed text-muted">Докоснете за точка. Плъзнете за преместване. Използвайте + и − за приближаване.</p>
          <button type="button" disabled={gpsPending} onClick={locate} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-accent/25 bg-surface-2 px-3.5 py-2.5 text-xs font-extrabold text-link disabled:opacity-60"><span aria-hidden="true">⌖</span>{gpsPending ? "Намиране…" : "Моето местоположение"}</button>
        </div>
        {gpsError ? <p role="alert" className="rounded-xl bg-surface-2 px-3 py-2 text-xs leading-relaxed text-ink">{gpsError}</p> : null}
        <ReportLocationMap point={point} focusPoint={focusPoint} onSelect={selectPoint} />
        <div aria-live="polite" className="text-xs leading-relaxed text-muted">
          {point ? <p className="font-semibold text-ink">Избрана точка: {point.lat.toFixed(5)}, {point.lon.toFixed(5)}</p> : <p>Още няма избрана точка.</p>}
          {accuracy !== null ? <p>Точност от устройството: около {accuracy} м. Проверете и преместете точката при нужда.</p> : null}
        </div>
        {point ? <label className="block space-y-1.5"><span className="text-xs font-bold">Адрес или ориентир</span><TextField value={address} maxLength={200} onChange={event => { manualAddress.current = true; setAddress(event.target.value); }} placeholder={addressPending ? "Намиране на адрес…" : "Може да уточните улица, номер или ориентир"} /><span className="block text-[0.6875rem] text-muted">Адресът е ориентир; избраните координати се запазват точно.</span></label> : null}
        {addressError ? <p role="status" className="text-xs leading-relaxed text-muted">{addressError}</p> : null}
        <p className="text-[0.6875rem] leading-relaxed text-muted">TomTom предоставя картата и адреса. Местоположението на устройството се заявява само след натискане на бутона.</p>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-4 py-3 sm:px-6">
        <button type="button" onClick={onClose} className="min-h-11 rounded-full border border-line px-4 py-2.5 text-sm font-bold text-muted">Отказ</button>
        <button type="button" disabled={!point || gpsPending} onClick={() => { if (point) onConfirm({ position: point, place: address.trim().length >= 2 ? address.trim() : coordinateLabel(point) }); }} className="np-gradient-bg min-h-11 rounded-full px-4 py-2.5 text-sm font-extrabold text-on-accent disabled:opacity-40">Използвай мястото</button>
      </div>
    </dialog>, document.body,
  );
}

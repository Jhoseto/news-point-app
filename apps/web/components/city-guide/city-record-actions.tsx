"use client";

import { useState } from "react";
import { cityDeadlineCalendar } from "@/lib/city-guide/calendar";

export function CityRecordActions({ title, deadline, email }: { title: string; deadline?: string; email?: string }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  return <div className="city-record-actions">
    {deadline ? <a download={`moyat-plovdiv-${deadline}.ics`} href={`data:text/calendar;charset=utf-8,${encodeURIComponent(cityDeadlineCalendar(title, deadline))}`}>↓ Запази срока в календара</a> : null}
    {email ? <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(email); setCopied(true); setCopyFailed(false); } catch { setCopyFailed(true); } }}>{copied ? "✓ Имейлът е копиран" : "Копирай имейла"}</button> : null}
    <span className="city-action-small" role="status">{copyFailed ? "Копирането е недостъпно. Можеш да маркираш имейла от текста." : copied ? "Готово — можеш да поставиш адреса в писмото си." : ""}</span>
  </div>;
}

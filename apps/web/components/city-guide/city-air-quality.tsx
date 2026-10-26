"use client";
import { useState } from "react";
import type { CityObservation } from "@/lib/city-guide/local-observations";
import "./city-air-quality.css";

const number = (value: string | number) => Number(value).toLocaleString("bg-BG", { maximumFractionDigits: 2 });
const time = (value: string | number) => new Date(String(value)).toLocaleString("bg-BG", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Sofia" });
export function CityAirQuality({ items }: { items: CityObservation["items"] }) {
  const [selected, setSelected] = useState(items[0]?.key ?? "");
  const [showAll, setShowAll] = useState(false);
  const current = items.find(item => item.key === selected) ?? items[0];
  if (!current) return null;
  const maximum = Math.max(1, ...items.map(item => Number(item.fields.pm10)), ...items.map(item => Number(item.fields.pm25)));
  return <div className="city-air"><div className="city-air-intro"><span>ГРАЖДАНСКИ ИЗМЕРВАНИЯ</span><p>Последни показания за фини прахови частици. Стойностите са ориентировъчни и не представляват официална оценка на въздуха за целия град.</p></div>
    <div className="city-air-reading"><header><strong>Сензор №{current.fields.sensorId}</strong><time dateTime={String(current.fields.measuredAt)}>{time(current.fields.measuredAt!)}</time></header><div className="city-air-values">{[["pm25", "PM2.5", "По-малки частици"], ["pm10", "PM10", "Частици до 10 µm"]].map(([key, label, description]) => <div key={key}><span>{label} <small>{description}</small></span><strong>{number(current.fields[key!]!)}<small>µg/m³</small></strong><div className="city-air-bar" aria-hidden="true"><span style={{ width: `${Number(current.fields[key!]!) / maximum * 100}%` }} /></div></div>)}</div></div>
    <p className="city-air-caption">Избери точка на измерване · {items.length} {items.length === 1 ? "активен сензор" : "активни сензора"}</p><div className="city-air-stations">{(showAll ? items : items.slice(0, 12)).map(item => <button type="button" key={item.key} aria-pressed={current.key === item.key} onClick={() => setSelected(item.key)}><span>№{item.fields.sensorId}</span><strong>{number(item.fields.pm25!)} <small>PM2.5 · µg/m³</small></strong><time dateTime={String(item.fields.measuredAt)}>{new Date(String(item.fields.measuredAt)).toLocaleTimeString("bg-BG", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Sofia" })}</time></button>)}</div>{!showAll && items.length > 12 ? <button type="button" className="city-air-more" onClick={() => setShowAll(true)}>Всички {items.length} точки на измерване ↓</button> : null}
  </div>;
}

"use client";
import { useEffect, useState } from "react";
import { departureLabel, type CityTimetable } from "@/lib/city-guide/timetable";

type Line = { key: string; line: string; destinations: string };
type Schedule = { serviceDate: string; checkedAt: string; timetable: CityTimetable };
export function CityTransitTimetable({ lines, checkedAt }: { lines: Line[]; checkedAt: string }) {
  const [selected, setSelected] = useState(lines[0]?.key ?? "");
  const [filter, setFilter] = useState("");
  const [data, setData] = useState<Schedule | null>(null);
  const [failed, setFailed] = useState(false);
  const [patternIndex, setPatternIndex] = useState(0);
  const [stopIndex, setStopIndex] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setFailed(false); setPatternIndex(0); setStopIndex(0);
    fetch(`/api/city-guide/transit?line=${encodeURIComponent(selected)}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error("unavailable"); return response.json() as Promise<Schedule>; })
      .then(value => { if (!controller.signal.aborted) setData(value); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [selected, checkedAt]);
  const pattern = data?.timetable[patternIndex];
  const stop = pattern?.stops[stopIndex];
  const line = lines.find(line => line.key === selected);
  const visible = lines.filter(line => `${line.line} ${line.destinations}`.toLocaleLowerCase("bg").includes(filter.trim().toLocaleLowerCase("bg")));
  return <div className="city-transit-timetable">
    <label className="city-workspace-search"><span aria-hidden="true">⌕</span><input type="search" aria-label="Намери автобусна линия" placeholder="Номер на линия или посока…" value={filter} onChange={event => setFilter(event.target.value)} /></label>
    <div className="city-transit-lines" aria-label="Автобусна линия">{visible.map(line => <button key={line.key} type="button" aria-pressed={selected === line.key} aria-label={`Линия ${line.line}`} onClick={() => setSelected(line.key)}>{line.line}</button>)}</div>
    {!visible.length ? <p>Няма линия с тези думи.</p> : null}
    <div className="city-transit-schedule" aria-busy={!data && !failed}>
      <h4>Линия {line?.line}</h4>
      {!data ? <p role="status">{failed ? "Разписанието в момента не може да бъде потвърдено." : "Зареждане на спирките и часовете…"}</p> : <>
        <p className="city-action-small">Планирано разписание за {new Intl.DateTimeFormat("bg-BG", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Sofia" }).format(new Date(`${data.serviceDate}T12:00:00Z`))}. Часовете не показват движението или закъснението на автобусите.</p>
        <div className="city-transit-selectors"><label>Посока и маршрут<select aria-label="Посока и маршрут" value={patternIndex} onChange={event => { setPatternIndex(Number(event.target.value)); setStopIndex(0); }}>{data.timetable.map((pattern, index) => <option key={pattern.id} value={index}>{pattern.destination} · от {pattern.stops[0]?.name} · {pattern.stops.length} спирки · вариант {index + 1}</option>)}</select></label><label>Избери спирка<select aria-label="Избери спирка" value={stopIndex} onChange={event => setStopIndex(Number(event.target.value))}>{pattern?.stops.map((stop, index) => <option key={`${stop.id}-${index}`} value={index}>{index + 1}. {stop.name}{stop.code ? ` · № ${stop.code}` : ""}</option>)}</select></label></div>
        {stop ? <div className="city-transit-departures"><h4>{stop.name}</h4><p>Планирани тръгвания от тази спирка</p>{stop.times.length ? <div>{stop.times.map(time => <span key={time}>{departureLabel(time)}</span>)}</div> : <p>Няма посочени тръгвания за качване от тази спирка.</p>}</div> : null}
        <details className="city-procedure-document"><summary>Всички спирки по маршрута <span aria-hidden="true">+</span></summary><ol className="city-transit-stop-list">{pattern?.stops.map((stop, index) => <li key={`${stop.id}-${index}`}><button type="button" aria-pressed={stopIndex === index} onClick={() => setStopIndex(index)}>{stop.name}{stop.code ? ` · № ${stop.code}` : ""}</button></li>)}</ol></details>
      </>}
    </div>
  </div>;
}

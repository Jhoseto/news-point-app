"use client";

import { useState } from "react";
import { transportDateLabel, type IntercitySourceView } from "@/lib/city-guide/intercity";
import "./city-bus-schedules.css";

export function CityIntercityTimetable({ sources }: { sources: IntercitySourceView[] }) {
  const [selectedSource, setSelectedSource] = useState(() => sources.find(source => source.status === "observed" && source.journeys.length)?.sourceId ?? sources[0]?.sourceId ?? "");
  const source = sources.find(source => source.sourceId === selectedSource) ?? sources[0];
  const journeys = source?.status === "observed" ? source.journeys : [];
  const dates = [...new Set(journeys.map(journey => journey.date))].sort();
  const [selectedDate, setSelectedDate] = useState(dates[0] ?? "");
  const date = dates.includes(selectedDate) ? selectedDate : dates[0];
  const visible = journeys.filter(journey => journey.date === date).sort((a, b) => a.time.localeCompare(b.time));
  return <div className="city-bus-schedules">
    <p className="city-bus-coverage">Публикувани курсове от Пловдив. Справката не обхваща всички превозвачи и направления.</p>
    <div className="city-bus-filters">
    <label className="city-bus-picker">Дестинация
      <select aria-label="Дестинация на автобуса" value={source?.sourceId ?? ""} onChange={event => { setSelectedSource(event.target.value); setSelectedDate(""); }}>
        {sources.map(source => <option key={source.sourceId} value={source.sourceId}>{source.destination}</option>)}
      </select>
    </label>
    {dates.length ? <label className="city-bus-picker">Дата на пътуване
      <select aria-label="Дата на пътуване" value={date} onChange={event => setSelectedDate(event.target.value)}>
        {dates.map(value => <option key={value} value={value}>{transportDateLabel(value)}</option>)}
      </select>
    </label> : null}
    </div>
    {source ? <p className="city-bus-source">Източник: {source.publisher}{source.checkedAt ? <>. <time dateTime={source.checkedAt}>{source.status === "observed" ? "Проверено" : "Последна проверка"} {new Intl.DateTimeFormat("bg-BG", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Sofia" }).format(new Date(source.checkedAt))}</time></> : null}.</p> : null}
    {source?.publisher === "Юнион Ивкони" ? <p className="city-bus-coverage">Показваме публикуваните директни курсове за днес и утре. Пътуванията с прекачване не са включени.</p> : null}
    {!visible.length ? <p role="status">В момента няма потвърдено разписание в справката. Това не означава, че няма автобуси.</p> : <>
      <h4 className="city-bus-date">Пловдив–{source?.destination} за {transportDateLabel(date!)}</h4>
      <ol className="city-bus-journeys" aria-label="Публикувани автобусни курсове">
        {visible.map(journey => <li key={journey.key}>
          <div className="city-bus-departure"><span>Тръгване</span><time dateTime={`${journey.date}T${journey.time}`}>{journey.time}</time></div>
          <div className="city-bus-journey-detail"><strong>{journey.departureStation}</strong>
            <p>Пристига в {journey.arrivalTime}{journey.arrivalDate !== journey.date ? ` на ${transportDateLabel(journey.arrivalDate)}` : ""}</p>
            <p>{journey.arrivalStation}</p>
          </div>
        </li>)}
      </ol>
    </>}
    <p className="city-bus-coverage">Часовете са планирани, по българско време. Няма информация за закъснения или свободни места. Провери точната спирка преди пътуване.</p>
  </div>;
}

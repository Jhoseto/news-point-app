"use client";

import { useState } from "react";
import { transportDateLabel } from "@/lib/city-guide/intercity";
import type { TransitDocument } from "@/lib/city-guide/transit-documents";
import "./city-bus-schedules.css";

export function CityTransitDocuments({ documents }: { documents: (TransitDocument & { key: string })[] }) {
  const ordered = [...documents].sort((a, b) => Number(a.line) - Number(b.line));
  const [selected, setSelected] = useState(ordered[0]?.key ?? "");
  const active = ordered.find(document => document.key === selected) ?? ordered[0];
  return <div className="city-bus-schedules">
    {!active ? <p role="status">В момента общинските документи не могат да бъдат потвърдени.</p> : <>
      <label className="city-bus-picker">Автобусна линия
        <select aria-label="Линия за общинско разписание" value={active.key} onChange={event => setSelected(event.target.value)}>
          {ordered.map(document => <option key={document.key} value={document.key}>Линия {document.line}</option>)}
        </select>
      </label>
      <div className="city-bus-document-detail">
        <h4>{active.title}</h4>
        <a className="city-bus-download" href={`/api/city-guide/document?sourceId=plovdiv-transit-documents&recordKey=${encodeURIComponent(active.key)}&hash=${active.hash}`} download>Изтегли разписанието за линия {active.line} (PDF)</a>
        <p>Включва таблици „Делник“ и „Празник“.</p>
        <p>Посочена валидност: {transportDateLabel(active.validFrom)} – {transportDateLabel(active.validThrough)}, освен при последваща промяна.</p>
      </div>
    </>}
    <p className="city-bus-coverage">Тук няма точни часове за междинните спирки. Временни отклонения и специални заповеди може да променят разписанието.</p>
  </div>;
}

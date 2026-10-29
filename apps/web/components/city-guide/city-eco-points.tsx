"use client";

import { useState } from "react";
import type { CityObservation } from "@/lib/city-guide/local-observations";

const LABELS: Record<string, string> = {
  yellow: "Пластмаса и метал",
  blue: "Хартия и картон",
  green: "Стъкло",
  brown: "Биоотпадъци",
  black: "Смесени битови отпадъци",
  tekstil: "Текстил",
  nuba: "Батерии и акумулатори",
};
const TYPES = ["yellow", "blue", "green", "brown", "black", "tekstil", "nuba"] as const;
const PAGE_SIZE = 18;

export function CityEcoPoints({ items }: { items: CityObservation["items"] }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const needle = query.toLocaleLowerCase("bg").trim();
  const counts = Object.fromEntries(TYPES.map(value => [value, items.filter(item => item.fields.type === value).length]));
  const matching = items.filter(item => (!type || item.fields.type === type)
    && (!needle || `${item.fields.address} ${item.fields.description ?? ""}`.toLocaleLowerCase("bg").includes(needle)));
  return <div className="city-eco-points">
    <div className="city-eco-tools">
      <label className="city-social-search">Търси улица или адрес<input type="search" value={query} onChange={event => { setQuery(event.target.value); setLimit(PAGE_SIZE); }} placeholder="Например булевард, квартал, улица..." /></label>
      <div className="city-eco-types" role="group" aria-label="Вид отпадък">
        <button type="button" aria-pressed={!type} onClick={() => { setType(""); setLimit(PAGE_SIZE); }}>Всички <span>{items.length}</span></button>
        {TYPES.map(value => <button key={value} type="button" data-type={value} aria-pressed={type === value} onClick={() => { setType(value); setLimit(PAGE_SIZE); }}>{LABELS[value]} <span>{counts[value]}</span></button>)}
      </div>
    </div>
    <p className="city-dog-count" role="status">{matching.length} {matching.length === 1 ? "публикувана точка" : "публикувани точки"} по избраните условия · показани {Math.min(limit, matching.length)}</p>
    {matching.length ? <div className="city-eco-list">{matching.slice(0, limit).map(item => {
      const fields = item.fields;
      const label = LABELS[String(fields.type)] ?? String(fields.type);
      return <article className="city-eco-row" key={item.key} data-type={String(fields.type)}>
        <div><small>{label} · №{item.key}</small><strong>{fields.address}</strong>{fields.description ? <p>{fields.description}</p> : null}</div>
      </article>;
    })}</div> : <p className="city-dog-empty">Няма точка с тези условия в последния получен списък.</p>}
    {matching.length > limit ? <button className="city-dog-more" type="button" onClick={() => setLimit(current => current + PAGE_SIZE)}>Покажи още точки</button> : null}
  </div>;
}

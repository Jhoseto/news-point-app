"use client";

import { useState } from "react";
import type { CityObservation } from "@/lib/city-guide/local-observations";
import { type CityStory } from "@/lib/city-guide/news";

const PAGE_SIZE = 12;

export function CityDogGallery({ items, story }: { items: CityObservation["items"]; story: CityStory | null }) {
  const [query, setQuery] = useState("");
  const [sex, setSex] = useState("");
  const [size, setSize] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const sexes = [...new Set(items.map(item => String(item.fields.sex)))].sort((a, b) => a.localeCompare(b, "bg"));
  const sizes = [...new Set(items.map(item => String(item.fields.size)))].sort((a, b) => a.localeCompare(b, "bg"));
  const needle = query.toLocaleLowerCase("bg").trim();
  const matching = items.filter(item => (!sex || item.fields.sex === sex) && (!size || item.fields.size === size)
    && (!needle || [item.fields.dogId, item.fields.breed, item.fields.sex, item.fields.size, item.fields.color, item.fields.description]
      .some(value => String(value ?? "").toLocaleLowerCase("bg").includes(needle))));
  const visible = matching.slice(0, limit);
  const resetLimit = () => setLimit(PAGE_SIZE);
  return <div className="city-dog-gallery">
    <div className="city-dog-tools">
      <label>Търси профил<input type="search" value={query} onChange={event => { setQuery(event.target.value); resetLimit(); }} placeholder="Номер, порода, описание..." /></label>
      <label>Пол<select value={sex} onChange={event => { setSex(event.target.value); resetLimit(); }}><option value="">Всички</option>{sexes.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>Размер<select value={size} onChange={event => { setSize(event.target.value); resetLimit(); }}><option value="">Всички</option>{sizes.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    </div>
    <p className="city-dog-count" role="status">{matching.length} {matching.length === 1 ? "публикуван профил" : "публикувани профила"} по избраните условия</p>
    {visible.length ? <div className="city-observed-grid">{visible.map(item => <article className="city-observed-item" key={item.key}>
      <strong>Профил №{item.fields.dogId}</strong><p>{item.fields.description}</p>
      <dl><div><dt>Порода</dt><dd>{item.fields.breed}</dd></div><div><dt>Пол</dt><dd>{item.fields.sex}</dd></div><div><dt>Размер</dt><dd>{item.fields.size}</dd></div><div><dt>Цвят</dt><dd>{item.fields.color}</dd></div></dl>
    </article>)}</div> : <p className="city-dog-empty">Няма профил с тези условия. Променете търсенето или филтрите.</p>}
    {matching.length > limit ? <button className="city-dog-more" type="button" onClick={() => setLimit(current => current + PAGE_SIZE)}>Покажи още профили</button> : null}
  </div>;
}

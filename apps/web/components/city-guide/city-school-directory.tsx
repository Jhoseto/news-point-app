"use client";

import { useState } from "react";
import Link from "next/link";
import type { CityObservation } from "@/lib/city-guide/local-observations";
import { cityNewsUrl } from "@/lib/city-guide/news";

const PAGE_SIZE = 12;

export function CitySchoolDirectory({ items, kind = "schools" }: { items: CityObservation["items"]; kind?: "schools" | "childcare" }) {
  const [query, setQuery] = useState("");
  const [district, setDistrict] = useState("");
  const [type, setType] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const needle = query.toLocaleLowerCase("bg").trim();
  const districts = [...new Set(items.map(item => String(item.fields.district)))].sort((a, b) => a.localeCompare(b, "bg"));
  const types = [...new Set(items.map(item => String(item.fields.type)))];
  const matching = items.filter(item => (!district || item.fields.district === district) && (!type || item.fields.type === type)
    && (!needle || [item.fields.name, item.fields.address].some(value => String(value).toLocaleLowerCase("bg").includes(needle))));
  const visible = matching.slice(0, limit);
  return <div className="city-social-services">
    <div className="city-school-filters">
      <label className="city-social-search">{kind === "childcare" ? "Търси градина, ясла или адрес" : "Търси училище или адрес"}<input type="search" value={query} onChange={event => { setQuery(event.target.value); setLimit(PAGE_SIZE); }} placeholder={kind === "childcare" ? "Например градина, ясла, улица..." : "Например училище, улица..."} /></label>
      <label>Район<select value={district} onChange={event => { setDistrict(event.target.value); setLimit(PAGE_SIZE); }}><option value="">Всички райони</option>{districts.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>Вид заведение<select value={type} onChange={event => { setType(event.target.value); setLimit(PAGE_SIZE); }}><option value="">Всички видове</option>{types.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    </div>
    <p className="city-dog-count" role="status">{matching.length} {kind === "childcare" ? "детски заведения" : matching.length === 1 ? "училище" : "училища"} в публикувания каталог по избраните условия</p>
    {visible.length ? <div className="city-observed-grid">{visible.map(item => {
      const fields = item.fields;
      const name = String(fields.name);
      return <article className="city-observed-item" key={item.key}>
        <strong>{name}</strong><p>{fields.type} · район {fields.district}</p>
        <dl><div><dt>Адрес</dt><dd>{fields.address}</dd></div><div><dt>Публикуван телефон</dt><dd>{fields.phone}</dd></div></dl>
        <Link href={cityNewsUrl(`${name} ${kind === "childcare" ? "детска градина ясла" : "училище"} Пловдив`)} prefetch={false} className="city-observed-news">Новини по темата в NewsPoint<span aria-hidden="true">↗</span></Link>
      </article>;
    })}</div> : <p className="city-dog-empty">Няма заведение с тези условия в публикувания каталог.</p>}
    {matching.length > limit ? <button className="city-dog-more" type="button" onClick={() => setLimit(current => current + PAGE_SIZE)}>Покажи още записи</button> : null}
  </div>;
}

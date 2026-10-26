"use client";

import { useState } from "react";
import Link from "next/link";
import type { CityObservation } from "@/lib/city-guide/local-observations";
import { cityNewsUrl } from "@/lib/city-guide/news";

const PAGE_SIZE = 12;

export function CitySocialServices({ items }: { items: CityObservation["items"] }) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const needle = query.toLocaleLowerCase("bg").trim();
  const matching = items.filter(item => !needle || [item.fields.name, item.fields.address, item.fields.services, item.fields.description]
    .some(value => String(value ?? "").toLocaleLowerCase("bg").includes(needle)));
  const visible = matching.slice(0, limit);
  return <div className="city-social-services">
    <label className="city-social-search">Търси услуга или адрес<input type="search" value={query} onChange={event => { setQuery(event.target.value); setLimit(PAGE_SIZE); }} placeholder="Например дневен център, подкрепа, улица..." /></label>
    <p className="city-dog-count" role="status">{matching.length} {matching.length === 1 ? "публикувана услуга" : "публикувани услуги"} по търсенето</p>
    {visible.length ? <div className="city-observed-grid">{visible.map(item => {
      const fields = item.fields;
      const name = String(fields.name);
      return <article className="city-observed-item" key={item.key}>
        <strong>{name}</strong>
        <p>{fields.services}</p>
        <details className="city-observed-detail"><summary>Каква помощ предлага и как да се свържа</summary><p>{fields.description}</p><dl>{fields.address ? <div><dt>Адрес</dt><dd>{fields.address}</dd></div> : null}{fields.phone ? <div><dt>Телефон</dt><dd>{fields.phone}</dd></div> : null}</dl></details>
        <Link href={cityNewsUrl(`${name} Пловдив`)} prefetch={false} className="city-observed-news">Новини по темата в NewsPoint<span aria-hidden="true">↗</span></Link>
      </article>;
    })}</div> : <p className="city-dog-empty">Няма услуга с тези думи в публикувания каталог.</p>}
    {matching.length > limit ? <button className="city-dog-more" type="button" onClick={() => setLimit(current => current + PAGE_SIZE)}>Покажи още услуги</button> : null}
  </div>;
}

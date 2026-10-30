import Link from "next/link";
import type { CityObservation } from "@/lib/city-guide/local-observations";
import { CITY_CATEGORIES } from "@/lib/city-guide/catalog";
import { cityContextGuidance, cityContextLinks, cityContextSources } from "@/lib/city-guide/search-context";
import "./city-search-context.css";

const receivedTime = new Intl.DateTimeFormat("bg-BG", {
  day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Sofia",
});

/** Server-rendered context remains readable before hydration and uses only supplied public data. */
export function CitySearchContext({ categorySlug, groups, availableSlugs }: {
  categorySlug?: string;
  groups: CityObservation[];
  availableSlugs: string[];
}) {
  const guidance = cityContextGuidance(categorySlug);
  const sources = cityContextSources(groups, categorySlug);
  const links = cityContextLinks(availableSlugs, categorySlug);
  const title = CITY_CATEGORIES.find(category => category.slug === categorySlug)?.title ?? "Моят Пловдив";
  return <section className="city-search-context" aria-labelledby="city-context-title">
    <h2 id="city-context-title">{guidance.question}</h2>
    <p>{guidance.answer}</p>
    <details className="city-context-details">
      <summary>За информацията в „{title}“</summary>
      <div className="city-context-body">
        <p>{guidance.scope}</p>
        <p>Справките използват публикувани данни от посочените източници. Часът показва кога системата е получила справката или е направила неуспешен опит за обновяване, а не кога издателят е променил информацията. Часовете са по българско време.</p>
        {sources.length ? <><h3>Произход и актуалност</h3><ul className="city-context-sources">{sources.map(source => <li key={source.id}>
          <strong>{source.name}</strong>
          <span>{source.status}</span>
          {source.partial ? <span>Обхватът може да е непълен.</span> : null}
          {source.checkedAt ? <span>{source.timeLabel}: <time dateTime={source.checkedAt}>{receivedTime.format(new Date(source.checkedAt))}</time></span> : <span>Няма надеждна дата за тази справка.</span>}
        </li>)}</ul></> : <p>В момента няма налични справки от външните източници за този раздел.</p>}
        <p>При остарели или недостъпни данни конкретни записи може да липсват. Това не доказва липса на събития, места, курсове или прекъсвания. Свързаните новини на NewsPoint са отделни публикации със собствен автор и дата.</p>
      </div>
    </details>
    {links.length ? <nav className="city-context-links" aria-label="Още полезни раздели в Моят Пловдив"><span>Още за Пловдив</span><ul>{links.map(link => <li key={link.href}><Link href={link.href}>{link.title}</Link></li>)}</ul></nav> : null}
  </section>;
}

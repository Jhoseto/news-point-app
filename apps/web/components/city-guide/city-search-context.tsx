import Link from "next/link";
import { cityContextGuidance, cityContextLinks } from "@/lib/city-guide/search-context";
import "./city-search-context.css";

/** Server-rendered context remains readable before hydration and uses only supplied public data. */
export function CitySearchContext({ categorySlug, availableSlugs }: {
  categorySlug?: string;
  availableSlugs: string[];
}) {
  const guidance = cityContextGuidance(categorySlug);
  const links = cityContextLinks(availableSlugs, categorySlug);
  return <section className="city-search-context" aria-labelledby="city-context-title">
    <h2 id="city-context-title">{guidance.question}</h2>
    <p>{guidance.answer}</p>
    {links.length ? <nav className="city-context-links" aria-label="Още полезни раздели в Моят Пловдив"><span>Още за Пловдив</span><ul>{links.map(link => <li key={link.href}><Link href={link.href}>{link.title}</Link></li>)}</ul></nav> : null}
  </section>;
}

import Link from "next/link";
import type { CityObservation } from "@/lib/city-guide/local-observations";
import { cityAgenda } from "@/lib/city-guide/event-agenda";

const day = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString("bg-BG", { day: "numeric", month: "long" });
const root = "/moyat-plovdiv";
export function CityHomeHighlights({ groups, culture, nightlife }: { groups: CityObservation[]; culture: CityObservation[]; nightlife: CityObservation[] }) {
  const find = (id: string) => groups.find(group => group.sourceId === id && group.status === "observed" && group.items.length);
  const buses = find("plovdiv-livetransport-gtfs"), water = find("vik-outages"), parking = find("plovdiv-parking-rules");
  const admissions = find("dz-admission-calendar"), air = find("plovdiv-community-air");
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Sofia" });
  const nextAdmission = admissions?.items.find(item => String(item.fields.onlineDeadline) >= today);
  const cultural = cityAgenda(culture, "culture").map(event => ({ ...event, category: "culture" }));
  const night = cityAgenda(nightlife, "nightlife").map(event => ({ ...event, category: "nightlife" }));
  const valid = [...cultural, ...night].filter(event => event.image && !event.recurrence && !["EventCancelled", "EventPostponed"].includes(event.status)).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const seen = new Set<string>();
  const primary = [valid.find(event => event.category === "culture" && event.kind !== "exhibition"), valid.find(event => event.category === "nightlife")].filter((event): event is (typeof valid)[number] => !!event);
  const events = [...primary, ...valid].filter(event => { if (seen.has(event.place)) return false; seen.add(event.place); return true; }).slice(0, 3);
  return <div className="city-home-highlights">
    {buses || parking || water || nextAdmission ? <section className="city-home-essentials" aria-label="Полезно за деня">
      {buses ? <Link className="city-home-journey" href={`${root}/transport/#nablyudavani-plovdiv-livetransport-gtfs`}><img src="/brand/plovdiv-aerial.webp" alt="" /><div><span className="city-home-overline">В ДВИЖЕНИЕ</span><h2>Твоята линия.<br /><em>Твоята спирка.</em></h2><p>Маршрути и планирани часове за {buses.items.length} автобусни линии.</p><span className="city-home-action">Отвори разписанията <span aria-hidden="true">↗</span></span></div></Link> : null}
      <div className="city-home-practical"><header><span className="city-home-overline">БЪРЗ ОРИЕНТИР</span><h2>Полезно за деня</h2></header>
        {water ? <Link href={`${root}/outages/#nablyudavani-vik-outages`}><span className="city-home-symbol" aria-hidden="true">≈</span><div><strong>Къде е спряна водата?</strong><p>{String(water.items[0]!.fields.place)}{water.items.length > 1 ? ` и още ${water.items.length - 1} обявени места` : ""}</p></div><span aria-hidden="true">↗</span></Link> : null}
        {parking ? <Link href={`${root}/parking/#nablyudavani-plovdiv-parking-rules`}><span className="city-home-symbol" aria-hidden="true">P</span><div><strong>Паркиране в центъра</strong><p>{parking.items.find(item => item.key === "sms-number") ? `Синя зона · SMS ${parking.items.find(item => item.key === "sms-number")!.fields.value}` : "Зони, цени и работно време"}</p></div><span aria-hidden="true">↗</span></Link> : null}
        {nextAdmission ? <Link href={`${root}/education/#nablyudavani-dz-admission-calendar`}><span className="city-home-symbol" aria-hidden="true">↳</span><div><strong>Прием в градини и ясли</strong><p>Онлайн заявления до {day(String(nextAdmission.fields.onlineDeadline))}</p></div><span aria-hidden="true">↗</span></Link> : null}
        {air ? <Link href={`${root}/environment/#nablyudavani-plovdiv-community-air`}><span className="city-home-symbol" aria-hidden="true">≈</span><div><strong>Фини прахови частици</strong><p>{air.items.length} граждански сензора · последни измервания</p></div><span aria-hidden="true">↗</span></Link> : null}
      </div>
    </section> : null}
    {events.length ? <section className="city-home-agenda" aria-label="Идеи за излизане"><header><div><span className="city-home-overline">ВРЕМЕ ЗА ИЗЛИЗАНЕ</span><h2>Следващото ти <em>преживяване.</em></h2></div><div><Link href={`${root}/culture/`}>Културен афиш ↗</Link><Link href={`${root}/nightlife/`}>Нощен Пловдив ↗</Link></div></header><div className="city-home-event-grid">{events.map(event => <Link href={`${root}/${event.category}/#event-${encodeURIComponent(event.id)}`} key={event.id} className="city-home-event"><div className="city-home-event-photo"><img src={event.image!} alt="" loading="lazy" /><time dateTime={event.date}>{event.kind === "exhibition" ? `До ${day(event.endDate)}` : day(event.date)}</time></div><div><span>{event.place}{event.performanceTime || event.time ? ` · ${event.performanceTime || event.time}` : ""}</span><h3>{event.title}</h3><span className="city-home-event-arrow" aria-hidden="true">↗</span></div></Link>)}</div></section> : null}
  </div>;
}

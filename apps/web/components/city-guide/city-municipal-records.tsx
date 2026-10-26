"use client";

import { useState } from "react";
import type { CityObservation } from "@/lib/city-guide/local-observations";
import { CityProcedureDocuments, CityProcedureSection } from "./city-procedure-documents";
import { CityRecordActions } from "./city-record-actions";
import { CityRelatedNews } from "./city-related-news";
import type { CityStory } from "@/lib/city-guide/news";

const dateFormat = new Intl.DateTimeFormat("bg-BG", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Sofia" });
const months = ["яну", "фев", "мар", "апр", "май", "юни", "юли", "авг", "сеп", "окт", "ное", "дек"];
const field = (fields: Record<string, string | number>, key: string) => String(fields[key] ?? "");
const date = (value: string) => dateFormat.format(new Date(`${value}T12:00:00Z`));

function consultationTitle(title: string): string {
  if (title.includes("местните такси и цени")) return "Промени в местните такси и цени на услуги";
  if (title.includes("Младежки център")) return "Правилата за работа на Младежкия център";
  if (title.includes("изграждане на тротоари")) return "Финансиране на ремонт и изграждане на тротоари";
  if (title.includes("разпореждане с общинско имущество")) return "Правила за управление на общинските имоти";
  return title;
}

export function CityMunicipalRecords({ group, news = {}, topicStories = [] }: { group: CityObservation; news?: Record<string, CityStory[]>; topicStories?: CityStory[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const source = group.sourceId;
  const rows = [...group.items].sort((a, b) => field(a.fields, "dueDate").localeCompare(field(b.fields, "dueDate")) || field(a.fields, "deadline").localeCompare(field(b.fields, "deadline")));
  return <div className="city-municipal-records">{rows.map(item => {
    const f = item.fields;
    const deadline = field(f, "dueDate") || field(f, "deadline");
    const isTax = source === "plovdiv-tax-notices";
    const isConsultation = source === "plovdiv-public-consultations";
    const isCompetition = source === "plovdiv-management-competitions";
    const isHousing = source === "plovdiv-housing";
    const auctionTitle = field(f, "title").replace(/^Обява за търг с тайно наддаване за /u, "");
    const title = isTax ? field(f, "label") : isConsultation ? consultationTitle(field(f, "title")) : isCompetition ? `Управител · ${field(f, "company")}` : isHousing ? field(f, "title") : auctionTitle.charAt(0).toLocaleUpperCase("bg") + auctionTitle.slice(1);
    const action = isTax ? "Срок за плащане" : isConsultation ? "Изпрати становище до" : isHousing ? "Условия за кандидатстване" : "Документи до";
    return <details className={`city-action-row${isTax ? " city-action-row-tax" : ""}`} key={item.key} id={`city-record-${source}-${item.key}`} open={expanded === item.key} onToggle={event => { const open = event.currentTarget.open; setExpanded(current => open ? item.key : current === item.key ? null : current); }}>
      <summary>
        {deadline ? <span className="city-date-stamp"><strong>{Number(deadline.slice(8, 10))}</strong><small>{months[Number(deadline.slice(5, 7)) - 1]}</small></span> : <span className="city-date-stamp city-date-stamp-icon" aria-hidden="true">⌂</span>}
        <span className="city-action-row-copy"><small>{isConsultation ? "ОБЩЕСТВЕНО ОБСЪЖДАНЕ" : isCompetition ? "ОТВОРЕН КОНКУРС" : isHousing ? "ЖИЛИЩЕН ФОНД" : isTax ? "ПРЕДСТОЯЩА ВНОСКА" : "ТЪРГ С ТАЙНО НАДДАВАНЕ"}</small><strong>{title}</strong><span>{action}{deadline ? ` ${date(deadline)}${f.time ? ` · ${f.time}` : ""}` : ""}</span></span>
        <span className="city-action-row-expand" aria-hidden="true">+</span>
      </summary>
      <div className="city-action-row-body">
        {isConsultation ? <><p className="city-action-full-title">{field(f, "title")}</p>{f.description ? <><h4>Какво се предлага</h4><p>{field(f, "description")}</p></> : null}<h4>Как да дадеш мнение</h4><p>Краен срок: <strong>{date(deadline)}</strong>. Имейл за становища: <strong>{field(f, "email")}</strong>.</p><details className="city-observed-detail"><summary>Други приети начини за подаване</summary><ul>{field(f, "ways").split("\n").filter(way => way && !way.startsWith("Електронна поща")).map((way, index) => <li key={index}>{way.replace(/https?:\/\/\S+/gu, "").trim()}</li>)}</ul></details><p className="city-action-small">Консултация {field(f, "number")} · Открита на {date(field(f, "opened"))}. Проектът още не е приет.</p></> : isCompetition ? <><h4>Подаване на документи</h4><p>{field(f, "place")}</p><p>До <strong>{date(deadline)}, {field(f, "time")} ч.</strong></p><p className="city-action-small">Обявен на {date(field(f, "published"))}. Пълната обява и приложените файлове са по-долу.</p><CityProcedureSection title="Кой може да кандидатства" value={f.requirements} /><CityProcedureSection title="Необходими документи" value={f.requiredDocuments} /><CityProcedureSection title="Етапи на конкурса" value={f.stages} /><CityProcedureSection title="Подаване и получаване на материалите" value={f.submission} /></> : isHousing ? <div className="city-housing-conditions">{field(f, "body").split("\n").filter(Boolean).map((line, index) => <p key={index}>{line}</p>)}</div> : isTax ? <><p>{field(f, "label")} — срокът е <strong>{date(deadline)}</strong>.</p><p>Сумата зависи от индивидуалното задължение. Тук не се показват лични данъчни сметки.</p><a href="#nablyudavani-plovdiv-taxes" className="city-action-inline">Виж касите и работното им време ↗</a></> : <><p>{field(f, "title")}</p><dl><div><dt>Документи до</dt><dd>{date(deadline)}</dd></div><div><dt>Търг на</dt><dd>{date(field(f, "auctionDate"))}</dd></div></dl>{f.startingRent ? <dl className="city-procedure-amounts"><div><dt>Начален наем · без ДДС</dt><dd>{f.startingRent} €</dd></div><div><dt>Депозит · с ДДС</dt><dd>{f.participationDeposit} €</dd></div><div><dt>Тръжни книжа · с ДДС</dt><dd>{f.documentFee} €</dd></div></dl> : null}<CityProcedureSection title="Условия, подаване и провеждане" value={f.auctionConditions} /><p className="city-action-small">Тук е пълната публикувана обява. Тръжните книжа се закупуват по описания в нея ред.</p></>}
        <CityProcedureDocuments raw={f.documents} sourceId={source} recordKey={item.key} />
        <CityRecordActions {...(deadline ? { calendarUrl: `/api/city-guide/calendar?sourceId=${encodeURIComponent(source)}&recordKey=${encodeURIComponent(item.key)}` } : {})} {...(isConsultation ? { email: field(f, "email") } : {})} />
        <CityRelatedNews stories={news[item.key] ?? []} topic="Свързани публикации" />
      </div>
    </details>;
  })}{expanded === null ? <CityRelatedNews stories={topicStories} topic="Свързани публикации" /> : null}</div>;
}


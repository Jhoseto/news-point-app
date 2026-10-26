import type { CityObservation } from "@/lib/city-guide/local-observations";

const dateFormat = new Intl.DateTimeFormat("bg-BG", { day: "numeric", month: "long" });
const steps = [
  ["vacanciesDate", "Обявяване на местата"],
  ["inPersonDeadline", "Заявление на място · до"],
  ["onlineDeadline", "Заявление по интернет · до"],
  ["resultsDate", "Резултати от класирането"],
  ["enrollmentDeadline", "Документи за записване · до"],
] as const;

export function CityAdmissionCalendar({ group }: { group: CityObservation }) {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Sofia" });
  return <div className="city-admission-calendar">
    {group.items.map((item, index) => <details key={item.key} className="city-admission-round" open={index === 0}>
      <summary><span><small>{String(item.fields.year)} · ГРАДИНИ И ЯСЛИ</small><strong>{String(item.fields.title)}</strong></span><span aria-hidden="true">+</span></summary>
      <div><ol>{steps.map(([key, label]) => <li key={key} data-past={String(item.fields[key]) < today}><span>{label}</span><time dateTime={String(item.fields[key])}>{dateFormat.format(new Date(`${item.fields[key]}T12:00:00Z`))}</time>{String(item.fields[key]) < today ? <small>Датата е минала</small> : null}</li>)}</ol>
      <p className="city-action-small">След класиране документите за записване се подават при директора на детското заведение. Записването е отделна стъпка от заявлението за участие.</p></div>
    </details>)}
  </div>;
}

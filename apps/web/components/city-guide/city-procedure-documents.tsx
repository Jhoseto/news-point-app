import { cityProcedureDocuments } from "@/lib/city-guide/procedure-documents";

export function CityProcedureDocuments({ raw, sourceId, recordKey }: { raw: string | number | undefined; sourceId: string; recordKey: string }) {
  const documents = cityProcedureDocuments(raw);
  if (!documents.length) return null;
  return <div className="city-procedure-documents"><h4>Документи по процедурата</h4>{documents.map(document => <details key={document.hash} className="city-procedure-document"><summary><span>{document.title}<small>PDF · {document.pages} стр.</small></span><span aria-hidden="true">+</span></summary><div><a className="city-action-inline" download href={`/api/city-guide/document?sourceId=${encodeURIComponent(sourceId)}&recordKey=${encodeURIComponent(recordKey)}&hash=${document.hash}`}>↓ Изтегли документа</a><p className="city-action-small">Текстът по-долу е извлечен от документа. Изтегленият PDF запазва оригиналното оформление и таблиците.</p><div className="city-procedure-transcript" tabIndex={0} aria-label={`Текст: ${document.title}`}>{document.text}</div></div></details>)}</div>;
}

export function CityProcedureSection({ title, value }: { title: string; value: string | number | undefined }) {
  if (typeof value !== "string" || !value) return null;
  return <details className="city-procedure-document"><summary>{title}<span aria-hidden="true">+</span></summary><div className="city-procedure-text">{value.replace(/\s(?=\d{1,2}\.\s+[А-Яа-я])/gu, "\n").split("\n").map((line, index) => <p key={index}>{line}</p>)}</div></details>;
}

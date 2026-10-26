import type { CityObservation } from "@/lib/city-guide/local-observations";
import { CityProcedureDocuments, CityProcedureSection } from "./city-procedure-documents";

export function CityLowEmissionPermit({ group }: { group: CityObservation }) {
  return <>{group.items.map(item => <div key={item.key} className="city-low-emission-permit">
    <h4>Кой може да заяви пропуск</h4><p>{String(item.fields.eligibility)}</p>
    <CityProcedureSection title="Необходими документи според случая" value={item.fields.requiredDocuments} />
    <CityProcedureSection title="Срок на пропуска и промяна на обстоятелствата" value={`${item.fields.validity}\n${item.fields.changes}`} />
    <h4>Подаване</h4><p>{String(item.fields.submission)}</p>
    <CityProcedureDocuments raw={item.fields.documents} sourceId={group.sourceId} recordKey={item.key} />
  </div>)}</>;
}

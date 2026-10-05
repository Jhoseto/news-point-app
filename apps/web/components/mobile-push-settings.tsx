"use client";

import { useId } from "react";
import type { PushController } from "./use-push-settings";
import "./mobile-push.css";

export function MobilePushSettings({ push }: { push: PushController }) {
  const id = useId();
  const { support, loading, busy, active, configured, error, notice, slugs, rubrics } = push;
  const install = support?.needInstall;
  const unsupported = support && !support.supported && !install;
  const blocked = support?.permission === "denied";
  const headline = loading ? "Проверяваме устройството…" : install ? "Първо добавете приложението" : unsupported ? "Известията не се поддържат"
    : blocked ? "Разрешете известията" : active ? "Известията са включени" : "Вашите новини. Навреме.";
  return (
    <section className="np-mobile-push" aria-labelledby={`${id}-title`} aria-busy={busy || loading}>
      <div className="np-mobile-push-heading">
        <span className="np-mobile-push-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/></svg></span>
        <div><p className="np-mobile-push-eyebrow">НОТИФИКАЦИИ</p><h3 id={`${id}-title`}>{headline}</h3></div>
      </div>
      {install ? (
        <ol className="np-mobile-push-steps">
          <li>Отворете менюто за споделяне на браузъра.</li>
          <li>Изберете „На началния екран“ / Add to Home Screen.</li>
          <li>Отворете NewsPoint от новата икона и включете известията тук.</li>
        </ol>
      ) : unsupported ? <p className="np-mobile-push-copy">На iPhone е нужен iOS 16.4 или по-нов и приложение на началния екран. На Android използвайте браузър с поддръжка на известия, например Chrome.</p>
        : blocked ? <p className="np-mobile-push-copy">Отворете системните настройки за известия на NewsPoint и разрешете показването им. След това се върнете тук и натиснете „Провери отново“.</p>
        : <p className="np-mobile-push-copy">{active ? "Получавате нови публикации от избраните рубрики, включително когато приложението е затворено." : "Изберете рубриките, които ви интересуват. Вие решавате кога да включите известията."}</p>}
      {!install && !unsupported && !blocked ? <>
        <label className="np-mobile-push-master">
          <span><strong>Новини по известие</strong><small>{loading ? "Проверка…" : active ? "Включени за това устройство" : "Изключени за това устройство"}</small></span>
          <input type="checkbox" role="switch" checked={active} disabled={busy || loading || (!active && !configured)} onChange={() => void (active ? push.disable() : push.enable())} />
        </label>
        {!configured && !loading ? <p className="np-mobile-push-copy">Известията още не са активирани на този сървър. Настройките ви се запазват.</p> : null}
        <fieldset className="np-mobile-push-rubrics" disabled={busy || loading}>
          <legend>Какви новини искате?</legend>
          <label className="np-mobile-push-choice np-mobile-push-all"><input type="checkbox" checked={slugs === null} onChange={(event) => void push.choose(event.target.checked ? null : [])}/><span>Всички рубрики</span></label>
          {slugs !== null ? <div className="np-mobile-push-grid">{rubrics.map((item) => <label key={item.slug} className="np-mobile-push-choice"><input type="checkbox" checked={slugs.includes(item.slug)} onChange={(event) => void push.choose(event.target.checked ? [...slugs, item.slug] : slugs.filter((slug) => slug !== item.slug))}/><span>{item.name}</span></label>)}</div> : null}
          {slugs?.length === 0 ? <p className="np-mobile-push-copy">Няма избрана рубрика — няма да получавате известия за новини.</p> : null}
        </fieldset>
        {active ? <button className="np-mobile-push-secondary" type="button" disabled={busy || loading || !configured} onClick={() => void push.test()}>Провери с тестово известие</button> : null}
      </> : null}
      {error ? <p className="np-mobile-push-feedback" role="alert">{error}</p> : null}
      {notice ? <p className="np-mobile-push-feedback" role="status">{notice}</p> : null}
      {blocked || error ? <button className="np-mobile-push-secondary" disabled={busy} type="button" onClick={() => void push.refresh()}>Провери отново</button> : null}
      <p className="np-mobile-push-footnote">Настройките важат за това устройство. Можете да изключите известията по всяко време.</p>
    </section>
  );
}

'use client';

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import '../app/compass.css';
import './landing.css';
import Instrument from './Instrument';
import Quiz from './Quiz';
import { answerWorldQuestion, freshSession, questionOrder, readWorldSession, storageKey, totalQuestions } from '../src/world-session.mjs';

const Report = lazy(() => import('./Report'));
const Comparison = lazy(() => import('./Comparison').then(module => ({ default: module.Comparison })));
const Research = lazy(() => import('./Research'));
function routeFor(hash, finished) {
  if (hash === '#compare') return 'compare';
  if (hash === '#editor') return 'editor';
  if (hash === '#report') return finished ? 'report' : 'test';
  return hash === '#test' ? 'test' : 'home';
}

export default function CompassApp() {
  const [session, setSession] = useState(freshSession);
  const questions = questionOrder(session.layout);
  const [page, setPage] = useState('home');
  const [save, setSave] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [ready, setReady] = useState(false);
  const main = useRef(null);
  useEffect(() => {
    let saved;
    try { saved = readWorldSession(JSON.parse(localStorage.getItem(storageKey))); } catch {}
    setSession({ ...(saved || freshSession()), reportKey: saved?.reportKey || crypto.randomUUID() });
    if (saved) setSave(true);
    setPage(routeFor(window.location.hash, saved?.finished));
    setReady(true);
  }, []);
  useEffect(() => {
    const sync = () => setPage(routeFor(window.location.hash, session.finished));
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [session.finished]);
  useEffect(() => {
    if (!ready || !save) return;
    try { localStorage.setItem(storageKey, JSON.stringify(session)); }
    catch { setSave(false); setStorageError('Браузърът не успя да запази теста. Можеш да продължиш в този прозорец.'); }
  }, [session, ready, save]);
  useEffect(() => {
    if (page !== 'home' && page !== 'test') {
      main.current?.focus({ preventScroll: true });
      main.current?.scrollIntoView({ block: 'start' });
    }
  }, [page]);
  function go(target) {
    if (window.location.hash !== '#' + target) window.history.pushState(null, '', '#' + target);
    setPage(target);
  }
  function advance(value) {
    const next = answerWorldQuestion(session, value);
    setSession(next);
    if (next.finished && (!session.finished || session.index === questions.length - 1)) go('report');
  }
  function toggleSave(checked) {
    setStorageError('');
    if (!checked) {
      try { localStorage.removeItem(storageKey); }
      catch { setStorageError('Браузърът не позволи изтриване на записа.'); return; }
    }
    setSave(checked);
  }
  return <div className="np-compass" ref={main} tabIndex={-1}>
      {page !== 'home' && page !== 'test' && <button className="pc-home-link" onClick={() => go('home')}>← Политически компас</button>}
      {page === 'home' && <section className="pc-cover">
        <div className="pc-cover-story"><header className="pc-cover-heading">
          <p className="pc-byline">NewsPoint.bg</p>
          <h1>Политически компас</h1>
        </header><div className="pc-cover-copy">
          <p className="pc-cover-lead">Когато партиите останат извън кадър, кои решения би подкрепил?</p>
          <p>Заглавията, телевизионните спорове и хората в социалните мрежи влияят на начина, по който говорим за политика. Тук можеш да провериш доколко партията, която чувстваш близка, действително гласува като теб.</p>
          <div className="pc-intro-actions"><button disabled={!ready} className="pc-primary" onClick={() => go(session.finished ? 'report' : 'test')}>{session.finished ? 'Виж моя доклад' : Object.keys(session.answers).length ? 'Продължи теста' : 'Започни теста'}</button><span>{totalQuestions} въпроса</span></div>
          <label className="pc-save"><input type="checkbox" checked={save} onChange={e => toggleSave(e.target.checked)}/> Запази напредъка на това устройство</label>
          {storageError && <p role="status">{storageError}</p>}
        </div><div className="pc-cover-instrument" aria-hidden="true"><Instrument/></div></div>
        <div className="pc-cover-notes"><section><h2>Зад компаса</h2>
          <p>ИТ екипът на NewsPoint.bg разработи Политическия компас изцяло за читателите на сайта. Той е безплатен. Целта ни е да имаш повече информация, за да прецениш сам къде стоиш.</p>
          <details><summary>Как четем резултатите</summary><p>Съпоставяме решенията ти с поименни гласувания в българското Народно събрание. Отделно нашият модел измерва близостта ти до политически традиции по теми като доходи, лична свобода и роля на държавата. Като международен ориентир в източниците ни е включено изследването <a className="pc-text-action" href="https://www.chesdata.eu/ches-europe/" target="_blank" rel="noopener noreferrer">Chapel Hill Expert Survey Europe</a>. Оценките в компаса са по собствените скали на NewsPoint.</p></details></section>
          <section><h2>А ако попиташ приятел?</h2><p>Накрая запазваме обобщения ти резултат под шестзнаков код. Всеки, с когото го споделиш, може да сравни двата ви анализа. Не се изискват име, имейл или регистрация.</p>
          <button className="pc-text-action" onClick={() => go('compare')}>Сравни два кода</button></section></div>
      </section>}
      {page === 'test' && <Quiz questions={questions} index={session.index} answers={session.answers} onAnswer={advance} onExit={() => go('home')}
        onViewReport={session.finished ? () => go('report') : null}
        onBack={() => session.index ? setSession({ ...session, index: session.index - 1 }) : go('home')}/>}
      <Suspense fallback={<p role="status">Зареждане…</p>}>
        {page === 'compare' && <Comparison/>}
        {page === 'report' && <Report answers={session.answers} reportKey={session.reportKey} onEdit={() => { setSession({...session, index: 0}); go('test'); }}
          onAnswerChange={(id, value) => setSession(prev => ({ ...prev, answers: { ...prev.answers, [id]: value } }))}
          onRestart={() => { setSession({...freshSession(), reportKey: crypto.randomUUID()}); go('test'); }}/>}
        {page === 'editor' && <Research section="editor" onExit={() => go('home')} onNavigate={() => go('home')}/>}
      </Suspense>
  </div>;
}


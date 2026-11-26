'use client';

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
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
  if (process.env.NODE_ENV === 'development' && hash === '#editor') return 'editor';
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
    let saved, remember = false;
    try {
      const tab = JSON.parse(sessionStorage.getItem(storageKey));
      saved = readWorldSession(tab);
      remember = saved && tab.rememberDevice === true;
    } catch {}
    if (!saved) {
      try { saved = readWorldSession(JSON.parse(localStorage.getItem(storageKey))); } catch {}
      remember = Boolean(saved);
    }
    setSession({ ...(saved || freshSession()), reportKey: saved?.reportKey || crypto.randomUUID() });
    setSave(Boolean(remember));
    const hash = window.location.hash;
    setPage(!hash && saved && Object.keys(saved.answers).length
      ? (saved.finished ? 'report' : 'test') : routeFor(hash, saved?.finished));
    setReady(true);
  }, []);
  useEffect(() => {
    const sync = () => setPage(routeFor(window.location.hash, session.finished));
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [session.finished]);
  useEffect(() => {
    if (!ready) return;
    try { sessionStorage.setItem(storageKey, JSON.stringify({ ...session, rememberDevice: save })); }
    catch { if (!save) setStorageError('Браузърът не успя да запази тази сесия.'); }
    if (!save) return;
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
  const rememberReport = useCallback((reportKey, shared) => {
    setSession(current => current.reportKey === reportKey ? { ...current, shared } : current);
  }, []);
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
          <p className="pc-cover-lead">В дни, в които политиците едно говорят, а друго вършат...</p>
          <p>Ние решихме да създадем за вас изцяло безплатен инструмент, който наричаме „Политически компас“.</p>
          <div className="pc-intro-actions"><button disabled={!ready} className="pc-primary" onClick={() => go(session.finished ? 'report' : 'test')}>{session.finished ? 'Виж моя доклад' : Object.keys(session.answers).length ? 'Продължи теста' : 'Започни теста'}</button><span>{totalQuestions} въпроса</span></div>
          <label className="pc-save"><input type="checkbox" checked={save} onChange={e => toggleSave(e.target.checked)}/> Запази напредъка на това устройство</label>
          {storageError && <p role="status">{storageError}</p>}
        </div><div className="pc-cover-instrument" aria-hidden="true"><Instrument/></div></div>
        <div className="pc-cover-notes"><section><h2>Инфо</h2>
          <p>Разработен е изцяло от IT екипа на NewsPoint.bg и е предназначен за читателите на сайта. Целта ни е да ви помогнем, като придобиете по-ясна представа в коя точно част на политическия спектър попадате чрез вашите виждания и идеология.</p>
          <p>По този начин можете реално да прецените дали вашите възгледи съвпадат с партиите, на които симпатизирате, и дали въобще вашият начин на мислене е представляван от една или друга партия на политическия терен.</p>
          <details><summary>Какви въпроси включва политическият тест?</summary>
            <p>Въпросите стъпват върху предложения в българския парламент. Сред тях са:</p>
            <ul>{questions.slice(0, 3).map(question => <li key={question.id}>{question.prompt}</li>)}</ul>
            <p>В анализа можеш да видиш как е гласувала всяка парламентарна група по съответното предложение. За последните решения на Народното събрание виж <a className="pc-text-action" href="/politika/">новините от рубрика „Политика“</a>.</p>
          </details>
          <details><summary>Как четем резултатите</summary><p>Съпоставяме решенията ти с поименни гласувания в българското Народно събрание. Отделно нашият модел измерва близостта ти до политически традиции по теми като доходи, лична свобода и роля на държавата. Като международен ориентир в източниците ни е включено изследването <a className="pc-text-action" href="https://www.chesdata.eu/ches-europe/" target="_blank" rel="noopener noreferrer">Chapel Hill Expert Survey Europe</a>. Оценките в компаса са по собствените скали на NewsPoint.</p></details></section>
          <section><h2>Сравни резултата с този на друг <span aria-hidden="true">&gt;|&lt;</span></h2>
          <p>Много от вас биха се учудили, но твърде често двама приятели, които си мислят, че изповядват едни и същи политически възгледи само защото подкрепят една и съща партия, се оказват на коренно противоположни позиции... Както и обратното!</p>
          <details><summary>Как да сравня</summary><p>Запазваме обобщения ти резултат под шестзнаков код. Всеки, с когото го споделиш, може да сравни двата ви анализа. Не изискваме име, имейл или регистрация, за да можем да запазим максимална анонимност за вас. Съхраняваме резултатите ви под формата единствено на този код. Ваша отговорност е ако пожелаете да го запазите.</p></details>
          <button className="pc-text-action" onClick={() => go('compare')}>Сравни два кода</button></section></div>
      </section>}
      {page === 'test' && <Quiz questions={questions} index={session.index} answers={session.answers} onAnswer={advance} onExit={() => go('home')}
        onViewReport={session.finished ? () => go('report') : null}
        onBack={() => session.index ? setSession({ ...session, index: session.index - 1 }) : go('home')}/>}
      <Suspense fallback={<p role="status">Зареждане…</p>}>
        {page === 'compare' && <Comparison/>}
        {page === 'report' && <Report answers={session.answers} reportKey={session.reportKey} shared={session.shared} onShared={rememberReport} onEdit={() => { setSession({...session, index: 0}); go('test'); }}
          onAnswerChange={(id, value) => setSession(prev => ({ ...prev, answers: { ...prev.answers, [id]: value } }))}
          onRestart={() => { setSession({...freshSession(), reportKey: crypto.randomUUID()}); go('test'); }}/>}
        {page === 'editor' && <Research section="editor" onExit={() => go('home')} onNavigate={() => go('home')}/>}
      </Suspense>
  </div>;
}


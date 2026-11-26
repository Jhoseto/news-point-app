import { useEffect, useRef } from 'react';
import { questionArt } from '../data/question-art.mjs';
import QuestionNews from './QuestionNews';
import '../app/quiz.css';

export default function Quiz({ questions, index, answers, onAnswer, onBack, onExit, onViewReport }) {
  const q = questions[index];
  const heading = useRef(null);
  const counter = useRef(null);
  const guide = useRef(null);
  const number = String(index + 1).padStart(2, '0');

  useEffect(() => {
    const title = heading.current;
    title?.focus({ preventScroll: true });
    if (!title) return;
    const bar = counter.current;
    const top = parseFloat(getComputedStyle(bar).scrollMarginTop) || 0;
    if (bar.getBoundingClientRect().top < top || title.getBoundingClientRect().bottom > window.innerHeight) {
      bar.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }, [q.id]);

  return <section className="pc-quiz" aria-label="Политически компас" onKeyDown={event => {
    if (event.key === 'Escape' && !guide.current?.open) onExit();
  }}>
    <div className="pc-stage">
      <div className="pc-visual">
        <div key={q.id} className="pc-scene" data-art={questionArt[q.id]} aria-hidden="true"/>
        <div className="pc-caption" key={q.title}><span>Тема</span><strong>{q.title}</strong></div>
      </div>
      <div className="pc-ballot">
        <div ref={counter} className="pc-counter"><span>Въпрос <b>{number}</b> от {questions.length}</span>
          <div className="pc-tools">
            <button className="pc-help" aria-haspopup="dialog" aria-controls="pc-vote-guide" onClick={() => guide.current?.showModal()}>За въпроса</button>
            <button className="pc-exit" onClick={onExit} aria-label="Изход от въпросника">Изход ×</button>
          </div>
        </div>
        <div className="pc-meter" role="progressbar" aria-label="Преминати въпроси" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={index}>
          <i style={{transform: 'scaleX(' + index / questions.length + ')'}}/>
        </div>
        <div key={q.id} className="pc-question">
          <h1 ref={heading} tabIndex={-1}>{q.prompt}</h1>
          <div className="pc-options">{q.options.map(({label, value}, i) =>
            <button key={value} aria-pressed={answers[q.id] === value} style={{'--pc-step': i}} onClick={() => onAnswer(value)}>
              <span aria-hidden="true">{'АБВГД'[i]}</span>{label}
            </button>)}</div>
        </div>
        <nav className="pc-quiz-nav" aria-label="Навигация във въпросника">
          <button onClick={onBack}>← Назад</button>
          {onViewReport && <button onClick={onViewReport}>Към доклада</button>}
          <button onClick={() => onAnswer(null)}>Пропусни →</button>
        </nav>
      </div>
    </div>
    <QuestionNews key={q.id} question={q.id}/>
    <dialog ref={guide} id="pc-vote-guide" aria-labelledby="pc-guide-title" onClick={event => {
      if (event.target !== event.currentTarget) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) guide.current.close();
    }}>
      <header><h2 id="pc-guide-title">За въпроса</h2><button type="button" autoFocus aria-label="Затвори пояснението" onClick={() => guide.current.close()}>×</button></header>
      <div className="pc-guide-body"><strong>Предложението в парламента</strong><p>{q.proposal}</p><strong>Как се отчита отговорът?</strong>
      <p>Избери решението, чиито последици си готов да приемеш. То участва в профила на възгледите ти. С партиите сравняваме само ясната посока по гласувания проект. Ако никое решение не е твоето, избери „Пропусни“.</p>
      <button onClick={() => guide.current.close()}>Разбрах</button>
      <button className="pc-record-abstention" onClick={() => {
        guide.current.close();
        onAnswer('abstain');
      }}>Запиши изрично въздържане по проекта</button>
      </div>
    </dialog>
  </section>;
}

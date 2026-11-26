import { useEffect, useRef, useState } from 'react';

const dateFormat = new Intl.DateTimeFormat('bg-BG', { dateStyle: 'medium', timeZone: 'Europe/Sofia' });

export default function QuestionNews({ question }) {
  const [stories, setStories] = useState(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [edges, setEdges] = useState({ first: true, last: true });
  const rail = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/polit-compass/news/' + encodeURIComponent(question) + '/', { signal: controller.signal });
        if (!response.ok) throw new Error('News unavailable');
        const articles = await response.json();
        if (!controller.signal.aborted) setStories(articles);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [question, attempt]);

  useEffect(() => {
    const list = rail.current;
    if (!list) return;
    function update() {
      setEdges({ first: list.scrollLeft <= 1, last: list.scrollLeft + list.clientWidth >= list.scrollWidth - 1 });
    }
    const observer = new ResizeObserver(update);
    observer.observe(list);
    list.addEventListener('scroll', update, { passive: true });
    update();
    return () => { observer.disconnect(); list.removeEventListener('scroll', update); };
  }, [stories]);

  function slide(direction) {
    const list = rail.current;
    if (list) list.scrollBy({ left: direction * list.clientWidth });
  }

  return <section className="pc-news" aria-labelledby="pc-news-heading">
    <div className="pc-news-head">
      <h2 id="pc-news-heading">Новини по темата</h2>
      {(!edges.first || !edges.last) && <div className="pc-news-controls">
        <button type="button" aria-label="Предишни новини" disabled={edges.first} onClick={() => slide(-1)}>←</button>
        <button type="button" aria-label="Следващи новини" disabled={edges.last} onClick={() => slide(1)}>→</button>
      </div>}
    </div>
    {failed ? <p role="status">Новините временно не са достъпни. <button onClick={() => { setFailed(false); setAttempt(attempt + 1); }}>Опитай отново</button></p>
      : !stories ? <p role="status">Зареждане на новините…</p>
      : !stories.length ? <p>Все още няма публикации по този въпрос.</p>
      : <ul className="pc-news-rail" ref={rail}>{stories.map(article =>
        <li key={article.path}><a href={article.path} target="_blank" rel="noopener noreferrer">
          {article.image && <img {...article.image} alt="" loading="lazy" decoding="async"/>}
          <span><time dateTime={article.publishedAt}>{dateFormat.format(new Date(article.publishedAt))}</time>
            <strong>{article.title}</strong><span className="sr-only"> (отваря се в нов раздел)</span>
          </span>
        </a></li>)}</ul>}
  </section>;
}

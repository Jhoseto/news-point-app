import { voteQuestions } from '../data/bg-votes.mjs';

// Read the actual carousel responses. A failed request must never count as an empty topic.
const since = Date.now() - 90 * 86400000;
const rows = [];
for (const q of voteQuestions) {
  const url = new URL('/polit-compass/news/' + encodeURIComponent(q.id) + '/', 'http://localhost:3000');
  try {
    const response = await fetch(url, {signal: AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const items = await response.json();
    rows.push({question:q.prompt, articles:items.length,
      recent:items.filter(item => Date.parse(item.publishedAt) >= since).length,
      firstThree:items.slice(0,3).map(item => ({title:item.title, date:item.publishedAt, path:item.path}))});
  } catch (error) {
    rows.push({question:q.prompt,error:error.cause?.code ?? error.message});
    process.exitCode = 1;
  }
}
console.log(JSON.stringify(rows,null,2));

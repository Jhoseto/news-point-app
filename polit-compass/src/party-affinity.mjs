import { questions as policyQuestions } from '../data/world-questions.mjs';

export const minimumPartyCoverage = Object.freeze({ issues: 3, topics: 2 });

const distinct = list => [...new Set(list)];
const mean = list => list.reduce((sum, value) => sum + value, 0) / list.length;
const roundPercent = value => Math.round(value * 10) / 10;
const validCoordinate = value => Number.isFinite(value) && value >= -1 && value <= 1;
const enough = (issues, topics) => issues >= minimumPartyCoverage.issues && topics >= minimumPartyCoverage.topics;
const isText = value => typeof value === 'string' && value.trim().length > 0;

function hasCitation(record) {
  if (![record.sourceTitle, record.quote, record.date, record.sourceUrl].every(isText)) return false;
  try {
    const url = new URL(record.sourceUrl);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

// Exactly one documented coding per party and question. A collision must be
// resolved by the editor before it contributes to either coverage or ranking.
function collectPositions(records, questionMap) {
  const byParty = new Map();
  for (const record of records) {
    if (!record || !questionMap.has(record.questionId)) continue;
    if (!byParty.has(record.partyId)) byParty.set(record.partyId, new Map());
    const positions = byParty.get(record.partyId);
    const options = questionMap.get(record.questionId).options;
    if (positions.has(record.questionId) || !hasCitation(record) ||
      !Array.isArray(record.values) || !record.values.length || distinct(record.values).length === options.length ||
      !record.values.every(value => options.some(option => option.value === value))) {
      positions.set(record.questionId, null);
    } else {
      positions.set(record.questionId, record);
    }
  }
  return byParty;
}

function compare(question, answer, record) {
  const similarities = record.values.map(value => 100 * (1 - Math.abs(answer - value) / 2));
  const min = Math.min(...similarities);
  const max = Math.max(...similarities);
  const option = value => question.options.find(item => item.value === value).label;
  return {
    questionId: question.id, topic: question.topic, topicTitle: question.title, prompt: question.prompt,
    answer, answerLabel: option(answer), positionLabels: distinct(record.values).map(option),
    record, similarity: min === max ? min : null, similarityRange: { min, max },
  };
}

// Equal weight for each covered topic; equal weight for each issue within it.
// A discrete set of possible positions gives bounds, never a fabricated mean.
function summarize(comparisons) {
  const topics = new Map();
  for (const row of comparisons) {
    if (!topics.has(row.topic)) topics.set(row.topic, []);
    topics.get(row.topic).push(row);
  }
  if (!enough(comparisons.length, topics.size)) return { similarity: null, similarityRange: null };
  const byTopic = [...topics.values()];
  const bound = key => roundPercent(mean(byTopic.map(rows => mean(rows.map(row => row.similarityRange[key])))));
  const min = bound('min');
  const max = bound('max');
  return { similarity: min === max ? min : null, similarityRange: { min, max } };
}

function rankSharedCore(parties, questions) {
  const questionIds = questions.map(q => q.id).filter(id =>
    parties.length > 1 && parties.every(p => p.comparisons.some(row => row.questionId === id)));
  const shared = new Set(questionIds);
  const topicIds = distinct(questions.filter(q => shared.has(q.id)).map(q => q.topic));
  const core = { questionIds, topicIds };
  if (!enough(shared.size, topicIds.length)) {
    return { ...core, status: 'insufficient', rows: [], winnerId: null, reason: 'insufficient-shared-coverage' };
  }
  const scores = parties.map(({ partyId, comparisons }) => ({
    partyId, ...summarize(comparisons.filter(row => shared.has(row.questionId))),
  }));
  const rows = scores.map(row => {
    const others = scores.filter(other => other.partyId !== row.partyId);
    const { min, max } = row.similarityRange;
    const bestRank = 1 + others.filter(other => other.similarityRange.min > max).length;
    const worstRank = 1 + others.filter(other => other.similarityRange.max > min).length;
    return { ...row, bestRank, worstRank, rank: bestRank === worstRank ? bestRank : null };
  }).sort((a, b) => a.bestRank - b.bestRank || a.worstRank - b.worstRank);
  const top = rows.filter(row => row.bestRank === 1);
  return { ...core, status: 'ready', rows, reason: null, winnerId: top.length === 1 ? top[0].partyId : null };
}

export function buildPartyAffinity({ answers = {}, parties, records, questions = policyQuestions }) {
  // The distance rule applies only to explicitly ordered policy options.
  // Named institutional models are nominal, so they cannot enter this scale.
  const policy = questions.filter(q => q.options.length > 1 && q.options.every(o => validCoordinate(o.value)));
  const answered = policy.filter(q => q.options.some(o => o.value === answers?.[q.id]));
  const positions = collectPositions(records, new Map(policy.map(q => [q.id, q])));
  const roster = distinct(parties.map(p => typeof p === 'string' ? p : p.id));
  const profiles = roster.map(partyId => {
    const forParty = positions.get(partyId) ?? new Map();
    const documented = [...forParty.values()].filter(Boolean).length;
    const comparisons = answered.filter(q => forParty.get(q.id)).map(q => compare(q, answers[q.id], forParty.get(q.id)));
    const topicIds = distinct(comparisons.map(row => row.topic));
    const sufficient = enough(comparisons.length, topicIds.length);
    return {
      partyId, comparisons, topicIds, ...summarize(comparisons),
      status: sufficient ? (comparisons.length === policy.length ? 'full' : 'partial') : 'insufficient',
      coverage: { total: policy.length, answered: answered.length, documented, comparable: comparisons.length, topics: topicIds.length },
    };
  });
  return { parties: profiles, ranking: rankSharedCore(profiles, answered), minimum: minimumPartyCoverage };
}

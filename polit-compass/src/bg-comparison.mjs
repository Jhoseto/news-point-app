import { election } from '../data/bg-party-roster.mjs';
import { resolveChoice, votes } from '../data/bg-votes.mjs';
import { voteCsv } from '../data/bg-vote-sources.mjs';

const groups = [
  ['pb', 'Прогресивна България'], ['gerb', 'ГЕРБ–СДС'], ['dps', 'ДПС'],
  ['db', 'Демократична България'], ['pp', 'Продължаваме промяната'], ['vaz', 'Възраждане'],
];
export const MIN_COMPARISON_ANSWERS = 10;
export const MIN_COMPARISON_AREAS = 3;
const formatDate = iso => iso.split('-').reverse().join('.');

// Two paths through the topic averages can differ by floating-point roundoff.
const compareScores = (a, b) => Math.abs(a - b) <= 1e-12 ? 0 : b - a;

function distributeShares(parties, scoreOf, totalScore) {
  const remainders = parties.map(party => {
    const exact = 100 * scoreOf(party) / totalScore;
    party.share = Math.floor(exact);
    return { party, remainder: exact - party.share };
  });
  // Largest remainders receive the undistributed points. Stable party IDs settle
  // rounding ties without affecting the independently calculated political rank.
  remainders.sort((a, b) => compareScores(a.remainder, b.remainder)
    || compareScores(scoreOf(a.party), scoreOf(b.party)) || a.party.partyId.localeCompare(b.party.partyId));
  const remaining = 100 - parties.reduce((sum, party) => sum + party.share, 0);
  for (const entry of remainders.slice(0, remaining)) entry.party.share += 1;
}

export function partyComparison(answers = {}, motions = votes) {
  const dates = motions.map(v => v.date).sort();
  const snapshotLabel = dates.length ? formatDate(dates[0]) + ' – ' + formatDate(dates.at(-1)) : '';
  const selected = [];
  const areaSizes = new Map();
  for (const vote of motions) {
    const option = resolveChoice(vote.id, answers[vote.id]);
    if (option?.ballotIndex == null) continue;
    selected.push({ vote, option });
    areaSizes.set(vote.area, (areaSizes.get(vote.area) ?? 0) + 1);
  }
  const areas = [...areaSizes.keys()];
  const ready = selected.length >= MIN_COMPARISON_ANSWERS && areas.length >= MIN_COMPARISON_AREAS;
  const parties = groups.map(([partyId, name]) => {
    const comparisons = selected.map(({ vote: v, option }) => {
      const counts = v.groups[partyId];
      const total = counts.reduce((sum, count) => sum + count, 0);
      const matchedCount = counts[option.ballotIndex];
      const share = 100 * matchedCount / total;
      return { questionId: v.id, prompt: v.prompt, topic: v.topic, area: v.area, date: v.date, number: v.number,
        sourceTitle: v.sourceTitle, sourceUrl: v.sourceUrl, billUrl: v.billUrl, transcriptUrl: v.transcriptUrl,
        groupCsv: v.groupCsv ?? voteCsv[v.date],
        for: counts[0], against: counts[1], abstain: counts[2], total,
        userValue: option.value, userLabel: option.label, weight: option.weight, matchedCount, share,
        matchesPosition: matchedCount === Math.max(...counts),
        similarity: Math.round(share) };
    });
    // Each area has one unit of potential weight, however many motions it contains.
    let weightedSum = 0, weightSum = 0;
    for (const row of comparisons) {
      const weight = row.weight / areaSizes.get(row.area);
      weightedSum += weight * row.share;
      weightSum += weight;
    }
    const mean = ready ? weightedSum / weightSum : null;
    const positionMatchCount = comparisons.filter(row => row.matchesPosition).length;
    return { partyId, name, shortName: name, alignment: mean, similarity: mean === null ? null : Math.round(mean),
      positionMatchCount, positionAgreement: selected.length ? Math.round(100 * positionMatchCount / selected.length) : null,
      fullMatch: ready && positionMatchCount === motions.length, share: null, comparisons };
  });
  const fullMatchIds = parties.filter(party => party.fullMatch).map(party => party.partyId).sort();
  let status = 'insufficient', winnerIds = [];
  if (ready) {
    const scoreOf = fullMatchIds.length ? party => Number(party.fullMatch) : party => party.alignment;
    const totalScore = parties.reduce((sum, party) => sum + scoreOf(party), 0);
    if (totalScore === 0) {
      status = 'no-match';
    } else {
      distributeShares(parties, scoreOf, totalScore);
      parties.sort((a, b) => compareScores(scoreOf(a), scoreOf(b)) || b.share - a.share || a.partyId.localeCompare(b.partyId));
      winnerIds = parties.filter(p => compareScores(scoreOf(p), scoreOf(parties[0])) === 0).map(p => p.partyId);
      status = winnerIds.length === 1 ? 'ranked' : 'tie';
    }
  }
  return { parties, election, snapshotLabel, total: motions.length, answered: selected.length,
    ranking: { status, winnerIds, fullMatchIds, questionIds: selected.map(({ vote }) => vote.id), topicIds: areas } };
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { voteQuestions, votes } from '../data/bg-votes.mjs';
import { partyComparison } from '../src/bg-comparison.mjs';
import { buildWorldProfile } from '../src/world-profile.mjs';
import { readWorldSession } from '../src/world-session.mjs';
import { decisionExamples, commonTopics } from '../src/report-insights.mjs';

const selected = Object.fromEntries(voteQuestions.map(q => [q.id, q.options[0].value]));

test('personal examples quote only measured choices from distinct contributing topics', () => {
  const lead = buildWorldProfile(selected).ranked[0];
  const {examples,difference} = decisionExamples(selected,lead);
  assert.ok(examples.length > 0 && examples.length <= 2);
  assert.equal(new Set(examples.map(e=>e.topic)).size,examples.length);
  for (const example of examples) assert.ok(voteQuestions.some(q=>q.options.find(o=>o.value===selected[q.id])?.label===example.label));
  if (difference) assert.ok(Math.abs(difference.axis.score-difference.target)>=.5);
  assert.deepEqual(decisionExamples({},undefined),{examples:[],difference:null});
});

test('friend comparison excludes missing measurements and retains equal distances', () => {
  const labels = ['a','b','c','d'].map(id=>({id}));
  const rows = commonTopics([{axes:[null,0,10,-100]},{axes:[50,0,10,100]}],labels);
  assert.deepEqual(rows.map(t=>[t.id,t.gap]),[['b',0],['c',0],['d',200]]);
});

test('every proposal has distinct solutions, with stable saved choices', () => {
  assert.equal(voteQuestions.length, 46);
  const axes = new Set(buildWorldProfile().axes.map(a => a.id));
  for (const q of voteQuestions) {
    assert.equal(new Set(q.options.map(o => o.value)).size, 3);
    assert.equal(new Set(q.options.map(o => o.label)).size, 3);
    for (const o of q.options) {
      assert.ok(axes.has(o.axis));
      assert.ok(o.score === null || [-1,-.5,0,.5,1].includes(o.score));
      assert.ok([0,1,null].includes(o.ballotIndex));
    }
  }
  const saved = readWorldSession({layout:'parliament-v2',index:45,answers:selected});
  assert.equal(saved.finished, true);
  assert.deepEqual(saved.answers, selected);
});

test('the same parliamentary vote can express opposite ideological priorities', () => {
  const id = 'bg-air-defence-2026';
  const a = {...selected, [id]:'policy:allies'};
  const b = {...selected, [id]:'policy:sovereign'};
  assert.deepEqual(partyComparison(a).parties.map(p => p.share),partyComparison(b).parties.map(p => p.share));
  const world = answers => buildWorldProfile(answers).axes.find(axis => axis.id === 'world').score;
  assert.ok(world(a) > world(b));
  assert.ok(buildWorldProfile(a).ranked.length > 0);
});

test('a conditional choice is not an abstention or a guessed political centre', () => {
  const a = {'bg-norway-grants-2026':'policy:case'};
  assert.equal(partyComparison(a).answered, 0);
  assert.equal(buildWorldProfile(a).answered, 1);
  assert.equal(buildWorldProfile(a).axes.find(x => x.id === 'world').count, 0);
});

test('old ballots stay comparable without acquiring invented motives', () => {
  const answers = Object.fromEntries(votes.map(v => [v.id,'lean-for']));
  assert.deepEqual(readWorldSession({answers,index:45,layout:'parliament-v2'}).answers, answers);
  assert.equal(partyComparison(answers).answered, 46);
  assert.equal(buildWorldProfile(answers).ranked.length, 0);
});

test('matching every recorded group position remains possible', () => {
  for (const party of Object.keys(votes[0].groups)) {
    const answers = Object.fromEntries(votes.map((v,i) => {
      const counts = v.groups[party];
      const direction = counts.indexOf(Math.max(...counts));
      return [v.id, direction === 2 ? 'abstain' : voteQuestions[i].options.find(o => o.ballotIndex === direction).value];
    }));
    assert.ok(partyComparison(answers).ranking.fullMatchIds.includes(party));
  }
});

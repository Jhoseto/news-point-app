import { questions as originalPolicies } from '../data/world-questions.mjs';
import { institutionQuestions } from '../data/institution-questions.mjs';
import { territoryQuestions } from '../data/territory-questions.mjs';
import { refinements } from '../data/world-refinement.mjs';
import { resolveChoice, voteQuestions } from '../data/bg-votes.mjs';

const layout = 'parliament-v2';
const knownLayouts = new Set([undefined, 'current', 'legacy-first', 'parliament-v1', layout]);
const savedFields = [...voteQuestions, ...refinements, ...originalPolicies, ...institutionQuestions, ...territoryQuestions];
export const totalQuestions = voteQuestions.length;
export const storageKey = 'compass:world-profile:v1';
export const freshSession = () => ({ layout, index: 0, answers: {}, finished: false });
export const questionOrder = () => voteQuestions;

const firstMissing = answers => voteQuestions.findIndex(q => !Object.hasOwn(answers, q.id));

export function answerWorldQuestion(session, value) {
  const id = voteQuestions[session.index].id;
  const editing = Object.hasOwn(session.answers, id);
  const answers = { ...session.answers, [id]: value };
  const missing = firstMissing(answers);
  const last = totalQuestions - 1;
  // When reviewing a previous choice, continue in order. When filling a gap
  // from a changed questionnaire, go straight to the next unanswered proposal.
  let index = missing < 0 ? session.index : missing;
  if (editing && session.index < last) index = session.index + 1;
  return { ...session, answers, index, finished: missing < 0 };
}

export function readWorldSession(raw) {
  if (!raw || !Number.isInteger(raw.index) || raw.index < 0 || !raw.answers ||
      typeof raw.answers !== 'object' || Array.isArray(raw.answers) || !knownLayouts.has(raw.layout)) return null;

  const answers = {};
  for (const q of savedFields) {
    if (!Object.hasOwn(raw.answers, q.id)) continue;
    const value = raw.answers[q.id];
    if (value === null || q.options.some(option => option.value === value) || (q.ballot && resolveChoice(q.id, value))) answers[q.id] = value;
  }

  const missing = firstMissing(answers);
  const last = totalQuestions - 1;
  const cursor = missing < 0 ? last : missing;
  // Old numeric offsets referred to a different list. IDs and explicit skips still match.
  const index = raw.layout === layout ? Math.min(raw.index, cursor) : cursor;
  const restored = { layout, index, answers, finished: missing < 0 };
  if (typeof raw.reportKey === 'string' && /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(raw.reportKey)) {
    restored.reportKey = raw.reportKey;
    if (raw.shared?.store === 'newspoint' && /^[A-HJ-NP-Z2-9]{6}$/.test(raw.shared.code) && typeof raw.shared.snapshot === 'string') {
      restored.shared = { code: raw.shared.code, snapshot: raw.shared.snapshot, store: 'newspoint' };
    }
  }
  return restored;
}

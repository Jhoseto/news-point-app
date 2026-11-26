/** Policy-choice boundary for the descriptive compass.
 * The browser supplies option ids, never numeric answers. Numeric codes belong
 * to the versioned question bank. Codes feed descriptive aggregate indices;
 * explicit per-question similarity matrices feed party comparisons.
 */
import { DEFAULT_MODEL, evaluateProfile, compareParties } from './engine.mjs';

const EPS = 1e-9;
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x)
  && (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
const text = x => typeof x === 'string' && x.trim().length > 0;
const unique = xs => [...new Set(xs)];
const mean = xs => xs.reduce((sum, x) => sum + x, 0) / xs.length;
const lex = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const round = n => n === 0 ? 0 : Math.sign(n) * Math.floor(Math.abs(n) + 0.5 + EPS);
const modelFor = options => options?.model ?? DEFAULT_MODEL;
const expectedVersion = 'bg-50-choice-3.0-beta';

function validateQuestionBank(questions, model, requireSimilarities = false) {
  if (!Array.isArray(questions) || questions.length !== 50) throw new RangeError('Exactly 50 policy-choice questions are required');
  if (model.questionSetVersion !== expectedVersion) throw new RangeError('A bg-50-choice-3.0-beta scoring model is required');
  if (!Array.isArray(model.allQuestionIds) || model.allQuestionIds.length !== 50 || unique(model.allQuestionIds).length !== 50) throw new RangeError('The model must declare all 50 unique question ids');
  const index = new Map(), optionIds = new Set();
  for (const question of questions) {
    if (!plain(question) || !model.allQuestionIds.includes(question.id) || index.has(question.id)) throw new RangeError('Question ids must be unique and match the scoring model');
    if (question.version !== model.questionSetVersion) throw new RangeError('Question version mismatch: ' + question.id);
    if (!text(question.text)) throw new TypeError('Question text is required: ' + question.id);
    if (!model.sections.includes(question.domainId) || !question.id.startsWith(question.domainId)) throw new RangeError('Question domain mismatch: ' + question.id);
    if (!Array.isArray(question.options) || question.options.length < 2 || question.options.length > 3) throw new RangeError('Each question must have two or three concrete policy options: ' + question.id);
    const options = new Map();
    for (const option of question.options) {
      if (!plain(option) || !text(option.id) || !option.id.startsWith(question.id + '_') || optionIds.has(option.id)) throw new RangeError('Option ids must be unique and belong to their question: ' + question.id);
      if (!text(option.label) || !text(option.interpretation) || !text(option.codingNote)) throw new TypeError('Option label, interpretation and codingNote are required: ' + option.id);
      if (!Number.isInteger(option.value) || !model.answerValues.includes(option.value)) throw new RangeError('Invalid versioned option code: ' + option.id);
      optionIds.add(option.id); options.set(option.id, option);
    }
    if (requireSimilarities) {
      const matrix = question.similarities;
      if (!plain(matrix) || Object.keys(matrix).length !== options.size || Object.keys(matrix).some(id => !options.has(id))) throw new RangeError('Complete explicit similarity matrix required: ' + question.id);
      for (const a of options.keys()) {
        const row = matrix[a];
        if (!plain(row) || Object.keys(row).length !== options.size || Object.keys(row).some(id => !options.has(id))) throw new RangeError('Incomplete similarity row: ' + a);
        for (const b of options.keys()) {
          const similarity = row[b];
          if (!Number.isFinite(similarity) || similarity < 0 || similarity > 100) throw new RangeError('Similarity must be a finite number from 0 to 100: ' + a + '/' + b);
          if (a === b && similarity !== 100) throw new RangeError('Identical options must have similarity 100: ' + a);
          if (!plain(matrix[b]) || !Number.isFinite(matrix[b][a]) || Math.abs(similarity - matrix[b][a]) > EPS) throw new RangeError('Similarity matrix must be symmetric: ' + a + '/' + b);
        }
      }
    }
    index.set(question.id, { question, options });
  }
  for (const domain of model.sections) if (questions.filter(q => q.domainId === domain).length !== 10) throw new RangeError('Each of the five domains must contain ten questions');
  return index;
}

/** Returns all 50 rows, including explicit nulls. Unanswered is not a policy. */
export function normalizeChoices({ choices = {}, questions, options = {} } = {}) {
  const model = modelFor(options), index = validateQuestionBank(questions, model);
  if (!plain(choices)) throw new TypeError('choices must be a question-id object');
  for (const id of Object.keys(choices)) if (!index.has(id)) throw new RangeError('Unknown question: ' + id);
  const numericResponses = {}, selectedPositions = [];
  for (const id of model.allQuestionIds) {
    const { question, options: declaredOptions } = index.get(id);
    const supplied = has(choices, id), input = supplied ? choices[id] : null;
    if (input !== null && !plain(input)) throw new TypeError('Choice must be null or an optionId object: ' + id);
    if (input !== null) {
      const unexpected = Object.keys(input).filter(key => !['optionId', 'importance', 'missingReason'].includes(key));
      if (unexpected.length) throw new TypeError('Unsupported choice fields (numeric answers are not accepted): ' + id + '.' + unexpected.join(','));
      if (!has(input, 'optionId')) throw new TypeError('optionId is required: ' + id);
      if (input.optionId !== null && !text(input.optionId)) throw new TypeError('optionId must be a declared string or null: ' + id);
    }
    const optionId = input === null ? null : input.optionId;
    const selected = optionId === null ? null : declaredOptions.get(optionId);
    if (optionId !== null && !selected) throw new RangeError('Unknown option for question ' + id + ': ' + optionId);
    const importance = input?.importance ?? 1;
    if (importance !== 1 && importance !== 2) throw new RangeError('importance must be 1 or 2: ' + id);
    const missingReason = input?.missingReason ?? (supplied && optionId === null ? 'skip' : null);
    if (![null, 'skip', 'unknown'].includes(missingReason)) throw new RangeError('Invalid missingReason: ' + id);
    if (selected && missingReason !== null) throw new RangeError('A selected option cannot have a missingReason: ' + id);
    const value = selected?.value ?? null;
    numericResponses[id] = { value, importance: selected ? importance : 1, missingReason };
    selectedPositions.push({
      questionId: id, questionText: question.text, domainId: question.domainId,
      optionId: selected?.id ?? null, label: selected?.label ?? null,
      interpretation: selected?.interpretation ?? null, codingNote: selected?.codingNote ?? null,
      value, importance: selected ? importance : 1, missingReason,
      policyMeaning: selected ? (value === 0 ? 'concrete_middle_coded_policy' : 'concrete_policy') : 'unanswered',
      evidenceIds: selected ? ['response:' + id] : [],
    });
  }
  const answered = selectedPositions.filter(row => row.optionId !== null).length;
  return { numericResponses, selectedPositions, coverage: { answered, total: 50, fraction: answered / 50 }, questionSetVersion: model.questionSetVersion };
}

/** Numerical aggregation is inherited; exact selected policies remain attached. */
export function evaluateChoices({ choices = {}, questions, options = {} } = {}) {
  const normalized = normalizeChoices({ choices, questions, options });
  const profile = evaluateProfile(normalized.numericResponses, options);
  const selectedById = new Map(normalized.selectedPositions.map(row => [row.questionId, row]));
  for (const row of normalized.selectedPositions) Object.assign(profile.policyFlags[row.questionId], {
    optionId: row.optionId, label: row.label, interpretation: row.interpretation,
    codingNote: row.codingNote, policyMeaning: row.policyMeaning,
    stance: row.label ?? 'unanswered', strength: null,
  });
  for (const fact of profile.facts) if (fact.type === 'policy_position') {
    const row = selectedById.get(fact.parameters.questionId);
    Object.assign(fact.parameters, { optionId: row.optionId, label: row.label, policyMeaning: row.policyMeaning,
      stance: row.label ?? 'unanswered', strength: null });
  }
  return { ...profile, responseFormat: 'policy-choice', selectedPositions: normalized.selectedPositions,
    choiceCoverage: normalized.coverage,
    limitations: { ...profile.limitations, zeroIsConcretePolicy: true, codesAreNotConvictionStrength: true,
      numericCodesDoNotDetermineNominalSimilarity: true } };
}

function rank(entries, width) {
  const ordered = [...entries].sort((a, b) => b.score - a.score || lex(a.partyId, b.partyId)), groups = [];
  for (const entry of ordered) {
    let group = groups.at(-1);
    if (!group || group.topScore - entry.score > width + EPS) {
      group = { rank: groups.reduce((n, g) => n + g.items.length, 0) + 1, topScore: entry.score, items: [] }; groups.push(group);
    }
    group.items.push(entry);
  }
  return groups.flatMap((group, index) => group.items.sort((a, b) => lex(a.partyId, b.partyId)).map(entry => ({
    ...entry, displayScore: round(entry.score), rank: group.rank, tieGroup: index + 1,
    tied: group.items.length > 1,
    nearTieIds: entries.filter(other => other.partyId !== entry.partyId && Math.abs(other.score - entry.score) <= width + EPS).map(other => other.partyId).sort(lex),
  })));
}

/** Uses explicit matrices. A valid legacy numeric cell is still NOT a choice cell.
 * Publication validation is responsible for verifying the source and two-human
 * review records; this runtime additionally checks ids, codes, evidence and version.
 */
export function compareChoiceParties({ choices = {}, questions, snapshot = null, options = {} } = {}) {
  const model = modelFor(options), index = validateQuestionBank(questions, model, true);
  const normalized = normalizeChoices({ choices, questions, options });
  const selected = new Map(normalized.selectedPositions.map(row => [row.questionId, row]));
  const invalidCells = [];
  if (snapshot !== null && !plain(snapshot)) throw new TypeError('snapshot must be an object or null');
  if (snapshot && !Array.isArray(snapshot.parties)) throw new TypeError('snapshot.parties must be an array');
  const sanitized = snapshot === null ? null : { ...snapshot,
    questionSetVersion: snapshot.questionSetVersion ?? '__missing_question_set_version__',
    parties: snapshot.parties.map(party => {
      if (!plain(party)) throw new TypeError('Every party must be an object');
      const positions = {};
      for (const id of model.allQuestionIds) {
        const cell = party.positions?.[id], option = index.get(id).options.get(cell?.optionId);
        let reason = null;
        if (cell?.status === 'approved') {
          if (!option) reason = 'missing_or_invalid_option_id';
          else if (cell.value !== option.value) reason = 'option_code_mismatch';
          else if (cell.questionSetVersion !== undefined && cell.questionSetVersion !== model.questionSetVersion) reason = 'question_set_version_mismatch';
          else if (!Array.isArray(cell.evidenceIds) || !cell.evidenceIds.length || cell.evidenceIds.some(e => !text(e))) reason = 'missing_evidence';
        }
        if (reason) invalidCells.push({ partyId: party.id, questionId: id, reason });
        positions[id] = cell?.status === 'approved' && !reason
          ? { ...cell, value: option.value }
          : { ...(plain(cell) ? cell : {}), optionId: null, value: null, status: 'unknown' };
      }
      return { ...party, positions };
    }),
  };
  // Eligibility comes from the existing fixed-core engine. Its scalar scores and
  // ranks are discarded below, including every thematic score and sensitivity.
  const result = compareParties(normalized.numericResponses, sanitized, { ...options, computeSensitivity: false });
  const parties = new Map((sanitized?.parties ?? []).map(p => [p.id, p]));
  const mode = result.mode;
  function scoreParty(party, ids) {
    const bySection = {};
    for (const domain of model.sections) {
      const relevant = ids.filter(id => index.get(id).question.domainId === domain);
      if (!relevant.length) continue;
      let numerator = 0, denominator = 0;
      for (const id of relevant) {
        const weight = mode === 'priorities' ? normalized.numericResponses[id].importance : 1;
        numerator += weight * index.get(id).question.similarities[selected.get(id).optionId][party.positions[id].optionId];
        denominator += weight;
      }
      bySection[domain] = numerator / denominator;
    }
    return { score: mean(Object.values(bySection)), bySection };
  }
  function comparisons(party, ids) {
    return ids.map(id => {
      const row = selected.get(id), partyOption = index.get(id).options.get(party.positions[id].optionId);
      return { questionId: id, userOptionId: row.optionId, userLabel: row.label,
        partyOptionId: partyOption.id, partyLabel: partyOption.label,
        similarity: index.get(id).question.similarities[row.optionId][partyOption.id],
        evidenceIds: unique(['response:' + id, ...party.positions[id].evidenceIds]) };
    });
  }
  if (result.global.ranking) {
    const ids = result.global.questionIds;
    const entries = result.global.ranking.map(entry => {
      const party = parties.get(entry.partyId), { score, bySection } = scoreParty(party, ids), scenarios = [];
      if (options.computeSensitivity !== false) for (const omittedQuestionId of ids) {
        const remaining = ids.filter(id => id !== omittedQuestionId);
        if (remaining.length < model.partyThresholds.minAnswered || model.sections.some(d => remaining.filter(id => index.get(id).question.domainId === d).length < model.partyThresholds.minAnsweredPerSection)) continue;
        const after = scoreParty(party, remaining).score;
        scenarios.push({ omittedQuestionId, score: after, deviation: Math.abs(after - score) });
      }
      return { partyId: entry.partyId, name: entry.name, score, bySection, evidenceIds: entry.evidenceIds,
        policyComparisons: comparisons(party, ids),
        sensitivity: { method: 'leave_one_answer_out', maxDeviation: scenarios.length ? Math.max(...scenarios.map(s => s.deviation)) : null,
          minScore: Math.min(score, ...scenarios.map(s => s.score)), maxScore: Math.max(score, ...scenarios.map(s => s.score)),
          scenarios, statisticalConfidenceInterval: false } };
    });
    result.global.ranking = rank(entries, model.partyThresholds.tieWidth);
  }
  for (const section of Object.values(result.sections)) if (section.ranking) {
    section.ranking = rank(section.ranking.map(entry => {
      const party = parties.get(entry.partyId), { score } = scoreParty(party, section.questionIds);
      return { partyId: entry.partyId, name: entry.name, score, evidenceIds: entry.evidenceIds,
        policyComparisons: comparisons(party, section.questionIds) };
    }), model.partyThresholds.tieWidth);
  }
  for (const entry of result.registry) entry.invalidCells = invalidCells.filter(cell => cell.partyId === entry.partyId);
  return { ...result, responseFormat: 'policy-choice', similarityMethod: 'explicit_question_option_matrix',
    selectedPositions: normalized.selectedPositions, choiceCoverage: normalized.coverage, invalidCells,
    limitations: { ...result.limitations, numericCodesDoNotDetermineNominalSimilarity: true,
      matricesAreEditorialNotEmpiricallyValidated: true } };
}

import release from '../data/release.json' with { type: 'json' };
import snapshot from '../data/party-positions.json' with { type: 'json' };
import sources from '../data/sources.json' with { type: 'json' };
import evidence from '../data/evidence.json' with { type: 'json' };
import entities from '../data/entities.json' with { type: 'json' };
import questions from '../data/questions.bg.json' with { type: 'json' };
import scoring from '../data/scoring-model.json' with { type: 'json' };
import config from '../data/report-config.json' with { type: 'json' };

export const seed = { release, snapshot, sources, evidence, entities };
export const questionBank = new Map(questions.map((q) => [q.id, q]));
export const baseId = release.id;
export class ApiError extends Error {
  constructor(status, message, issues) {
    super(message);
    this.status = status;
    this.issues = issues;
  }
}
export function requireThat(condition, status, message) {
  if (!condition) throw new ApiError(status, message);
}
const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const boundedText = (v, limit) => typeof v === 'string' && v.trim().length > 0 && v.length <= limit;
export async function digest(text) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))),
    (n) => n.toString(16).padStart(2, '0'),
  ).join('');
}
export function sourceUrlAllowed(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password;
  } catch {
    return false;
  }
}
const isId = (v) => typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_-]{1,63}$/.test(v);
function isDay(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const t = Date.parse(v + 'T00:00:00Z');
  return (
    Number.isFinite(t) &&
    new Date(t).toISOString().slice(0, 10) === v &&
    v <= new Date().toISOString().slice(0, 10)
  );
}
export function validatePackage(input, current, additionalHosts = []) {
  requireThat(
    plain(input) &&
      input.format === 'compass-editorial-proposals-v1' &&
      input.releaseId === current.release.id &&
      input.questionVersion === current.release.questionVersion,
    422,
    'Пакетът трябва да съответства на текущата версия.',
  );
  requireThat(
    Object.keys(input).every((k) =>
      ['format', 'releaseId', 'questionVersion', 'proposals', 'sources', 'evidence'].includes(k),
    ),
    422,
    'Пакетът съдържа непознати полета.',
  );
  requireThat(
    Array.isArray(input.proposals) && input.proposals.length > 0 && input.proposals.length <= 150,
    422,
    'Един импорт приема между 1 и 150 предложения.',
  );
  const records = new Map(current.evidence.map((e) => [e.id, e])),
    docs = new Map(current.sources.map((s) => [s.id, s])),
    seen = new Set(),
    issues = [];
  const newSources = input.sources ?? [],
    newEvidence = input.evidence ?? [];
  requireThat(
    Array.isArray(newSources) &&
      newSources.length <= 150 &&
      Array.isArray(newEvidence) &&
      newEvidence.length <= 150,
    422,
    'Невалиден брой източници или доказателства.',
  );
  const normHost = (host) => host.toLowerCase().replace(/^www\./, '');
  const hosts = new Set([
    ...seed.sources.map((s) => normHost(new URL(s.url).hostname)),
    ...additionalHosts.map(normHost),
  ]);
  for (const s of newSources) {
    requireThat(
      plain(s) &&
        isId(s.id) &&
        !docs.has(s.id) &&
        Object.keys(s).every((k) =>
          ['id', 'title', 'url', 'kind', 'publishedAt', 'retrievedAt', 'use'].includes(k),
        ),
      422,
      'Източник с невалиден или вече използван идентификатор/поле.',
    );
    requireThat(
      boundedText(s.title, 500) &&
        boundedText(s.kind, 90) &&
        boundedText(s.url, 2048) &&
        sourceUrlAllowed(s.url) &&
        hosts.has(normHost(new URL(s.url).hostname)) &&
        (!s.use || boundedText(s.use, 800)),
      422,
      'Невалидно описание или неодобрен домейн на източник ' + s.id + '.',
    );
    requireThat(
      isDay(s.retrievedAt) &&
        (s.publishedAt === null ||
          s.publishedAt === undefined ||
          (isDay(s.publishedAt) && s.publishedAt <= s.retrievedAt)),
      422,
      'Невалидна дата на източник ' + s.id + '.',
    );
    docs.set(s.id, {
      id: s.id,
      title: s.title.trim(),
      url: new URL(s.url).href,
      kind: s.kind.trim(),
      publishedAt: s.publishedAt ?? null,
      retrievedAt: s.retrievedAt,
      use: s.use?.trim() || '',
      accessStatus: 'editorial_review',
    });
  }
  for (const e of newEvidence) {
    requireThat(
      plain(e) &&
        isId(e.id) &&
        !records.has(e.id) &&
        Object.keys(e).every((k) =>
          ['id', 'sourceId', 'entityId', 'questionIds', 'claim', 'locator', 'scoreReason'].includes(k),
        ),
      422,
      'Доказателство с невалиден или вече използван идентификатор/поле.',
    );
    requireThat(
      docs.has(e.sourceId) &&
        current.entities.some((x) => x.id === e.entityId) &&
        boundedText(e.claim, 2500) &&
        boundedText(e.locator, 700) &&
        (!e.scoreReason || boundedText(e.scoreReason, 2500)),
      422,
      'Невалидни връзки или описание на доказателство ' + e.id + '.',
    );
    requireThat(
      Array.isArray(e.questionIds) &&
        e.questionIds.length > 0 &&
        e.questionIds.length <= 50 &&
        new Set(e.questionIds).size === e.questionIds.length &&
        e.questionIds.every((q) => questionBank.has(q)),
      422,
      'Невалидни въпроси в доказателство ' + e.id + '.',
    );
    records.set(e.id, {
      id: e.id,
      sourceId: e.sourceId,
      entityId: e.entityId,
      questionIds: e.questionIds,
      claim: e.claim.trim(),
      locator: e.locator.trim(),
      scoreReason: e.scoreReason?.trim() || '',
      status: 'candidate',
      codingStatus: 'needs_v3_option_review',
      sourceQuestionSetVersion: release.questionVersion,
    });
  }
  const proposals = input.proposals.map((p, i) => {
    try {
      requireThat(
        plain(p) &&
          Object.keys(p).every((k) => ['evidenceId', 'questionId', 'optionId', 'reason'].includes(k)),
        422,
        'Невалидни полета или клиентско твърдение за одобрение.',
      );
      const record = records.get(p.evidenceId),
        q = questionBank.get(p.questionId),
        source = docs.get(record?.sourceId);
      requireThat(
        record && sourceUrlAllowed(source?.url) && record.claim && record.locator,
        422,
        'Липсва проследим източник.',
      );
      requireThat(
        record.questionIds.includes(p.questionId) ||
          (record.questionIds.length === 0 && p.questionId === null),
        422,
        'Въпросът не принадлежи към доказателството.',
      );
      requireThat(
        p.optionId === null || q?.options.some((o) => o.id === p.optionId),
        422,
        'Опцията не принадлежи на въпроса.',
      );
      requireThat(boundedText(p.reason, 2500), 422, 'Необходима е обосновка до 2500 знака.');
      const key = JSON.stringify([p.evidenceId, p.questionId]);
      requireThat(!seen.has(key), 422, 'Дублирано предложение.');
      seen.add(key);
      return {
        evidenceId: record.id,
        entityId: record.entityId,
        questionId: p.questionId,
        optionId: p.optionId,
        reason: p.reason.trim(),
        evidence: record,
        source,
      };
    } catch (e) {
      issues.push('Запис ' + (i + 1) + ': ' + e.message);
      return null;
    }
  });
  if (issues.length) throw new ApiError(422, 'Импортът съдържа грешки.', issues);
  requireThat(
    newEvidence.every((e) => proposals.some((p) => p.evidenceId === e.id)) &&
      newSources.every((s) => proposals.some((p) => p.source.id === s.id)),
    422,
    'Всеки нов запис трябва да бъде свързан с предложена позиция.',
  );
  return proposals;
}
export function reviewStatus(reviews) {
  const regular = reviews.filter((r) => !r.adjudicate),
    yes = regular.filter((r) => r.decision === 'approve').length,
    no = regular.length - yes;
  const tie = reviews.find((r) => r.adjudicate);
  if (tie?.decision === 'reject' || (no >= 2 && !yes)) return 'rejected';
  if (no && yes && (tie?.decision !== 'approve' || yes < 2)) return 'disputed';
  return yes >= 2 ? 'approved' : 'pending';
}
function validateBank() {
  requireThat(
    questions.length === 50 &&
      new Set(questions.map((q) => q.id)).size === 50 &&
      scoring.questionSetVersion === release.questionVersion &&
      scoring.id === release.scoringVersion &&
      config.version === release.reportVersion,
    500,
    'Несъвместима банка въпроси.',
  );
  for (const d of ['E', 'P', 'I', 'G', 'D'])
    requireThat(questions.filter((q) => q.domainId === d).length === 10, 500, 'Невалиден раздел.');
  for (const q of questions) {
    const ids = new Set(q.options.map((o) => o.id));
    requireThat(
      q.version === release.questionVersion &&
        ids.size === q.options.length &&
        ids.size >= 2 &&
        ids.size <= 3,
      500,
      'Невалидни опции.',
    );
    for (const a of q.options)
      for (const b of q.options) {
        const n = q.similarities?.[a.id]?.[b.id];
        requireThat(
          [-2, -1, 0, 1, 2].includes(a.value) &&
            Number.isFinite(n) &&
            n >= 0 &&
            n <= 100 &&
            n === q.similarities[b.id][a.id] &&
            (a !== b || n === 100),
          500,
          'Невалидна матрица за сходство.',
        );
      }
  }
}
function validateApprovedCell(cell, partyId, questionId, document) {
  const question = questionBank.get(questionId),
    option = question?.options.find((o) => o.id === cell.optionId);
  requireThat(
    option &&
      option.value === cell.value &&
      cell.questionSetVersion === document.release.questionVersion &&
      cell.evidenceIds?.length > 0,
    422,
    'Невалидно кодиране при публикация.',
  );
  const sourceIds = new Set(document.sources.filter((s) => sourceUrlAllowed(s.url)).map((s) => s.id));
  for (const id of cell.evidenceIds) {
    const e = document.evidence.find((e) => e.id === id);
    requireThat(
      e?.entityId === partyId &&
        e.questionIds.includes(questionId) &&
        sourceIds.has(e.sourceId) &&
        e.locator &&
        e.claim,
      422,
      'Доказателството не съвпада с идентичността на субекта и въпроса.',
    );
  }
  const reviews = cell.reviews || [],
    all = [...reviews, ...(cell.adjudication ? [cell.adjudication] : [])],
    actors = new Set();
  for (const r of all) {
    requireThat(
      r.reviewerType === 'human' &&
        boundedText(r.reviewerId, 256) &&
        !actors.has(r.reviewerId) &&
        r.reviewerId !== cell.proposedBy &&
        r.questionSetVersion === cell.questionSetVersion &&
        r.optionId === cell.optionId &&
        r.value === cell.value &&
        ['approve', 'reject'].includes(r.decision) &&
        (r.decision === 'reject' || r.sourceChecked === true) &&
        r.contentHash === cell.contentHash &&
        r.reviewedAt &&
        r.rationale,
      422,
      'Невалидна рецензия.',
    );
    actors.add(r.reviewerId);
  }
  requireThat(
    reviewStatus([...reviews, ...(cell.adjudication ? [{ ...cell.adjudication, adjudicate: true }] : [])]) ===
      'approved',
    422,
    'Недостатъчно независими прегледи.',
  );
}
export function validateSnapshot(document) {
  validateBank();
  requireThat(
    document.release.scoringVersion === release.scoringVersion &&
      document.release.reportVersion === release.reportVersion &&
      document.snapshot.questionSetVersion === release.questionVersion,
    422,
    'Несъвместими версии на моделите.',
  );
  const core = document.snapshot.comparisonCoreIds,
    frozen = seed.snapshot.comparisonCoreIds;
  requireThat(
    JSON.stringify(core) === JSON.stringify(frozen) &&
      core.length >= 25 &&
      ['E', 'P', 'I', 'G', 'D'].every((d) => core.filter((id) => id[0] === d).length >= 5),
    422,
    'Невалидно ядро за сравнение.',
  );
  requireThat(
    document.snapshot.parties.length === seed.snapshot.parties.length &&
      seed.snapshot.parties.every(
        (p) => document.snapshot.parties.filter((row) => row.id === p.id).length === 1,
      ),
    422,
    'Непълен набор от субекти.',
  );
  let approved = 0;
  for (const p of document.snapshot.parties) {
    requireThat(Object.keys(p.positions).length === questions.length, 422, 'Непълна партийна матрица.');
    for (const q of questions) {
      const c = p.positions[q.id];
      requireThat(
        c && (c.status === 'approved' || (c.optionId === null && c.value === null)),
        422,
        'Невалидна партийна позиция.',
      );
      if (c.status === 'approved') {
        validateApprovedCell(c, p.id, q.id, document);
        approved++;
      }
    }
  }
  for (const [key, cell] of Object.entries(document.otherPositions ?? {})) {
    if (cell.status === 'approved') {
      const [entityId, questionId] = key.split('/');
      validateApprovedCell(cell, entityId, questionId, document);
    }
  }
  const rows = document.snapshot.parties;
  const ranked = rows.some((a, i) =>
    rows.slice(i + 1).some((b) => {
      const both = core.filter(
        (q) => a.positions[q].status === 'approved' && b.positions[q].status === 'approved',
      );
      return (
        both.length >= 25 &&
        ['E', 'P', 'I', 'G', 'D'].every((d) => both.filter((id) => id[0] === d).length >= 5)
      );
    }),
  );
  return { approved, ranked };
}

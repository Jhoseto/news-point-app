import {
  ApiError,
  baseId,
  boundedText,
  digest,
  questionBank,
  requireThat,
  reviewStatus,
  seed,
  validatePackage,
  validateSnapshot,
} from './editorial-data.mjs';

const stamp = () => new Date().toISOString();
export const stmt = (db, sql, ...args) => (args.length ? db.prepare(sql).bind(...args) : db.prepare(sql));
export const all = async (db, sql, ...args) => (await stmt(db, sql, ...args).all()).results;
export const first = (db, sql, ...args) => stmt(db, sql, ...args).first();
export const audit = (db, actor, action, id, reason, at) =>
  stmt(
    db,
    'INSERT INTO compass_audit(actor,action,object_id,reason,created_at) VALUES(?,?,?,?,?)',
    actor,
    action,
    id,
    reason,
    at,
  );
const invariant = (db, sql, ...args) =>
  stmt(db, 'INSERT INTO compass_guard(ok) SELECT 0 WHERE NOT (' + sql + ')', ...args);
const checkHead = (db, id) =>
  invariant(db, 'COALESCE((SELECT release_id FROM compass_head WHERE slot=1),?)=?', baseId, id);
const liveGuard = (db, p) =>
  invariant(
    db,
    'EXISTS(SELECT 1 FROM compass_proposals WHERE id=? AND base_id=?) AND NOT EXISTS(SELECT 1 FROM compass_publications WHERE proposal_id=?)',
    p.id,
    p.baseId,
    p.id,
  );
const memberGuard = (db, actor) =>
  actor.role === 'admin'
    ? []
    : [invariant(db, 'EXISTS(SELECT 1 FROM compass_members WHERE user_id=?)', actor.userId)];
export async function batch(db, commands) {
  try {
    return await db.batch(commands);
  } catch (e) {
    if (/(constraint|unique|immutable)/i.test(String(e?.cause?.message || '') + ' ' + e.message))
      throw new ApiError(409, 'Данните са променени. Обнови списъка и провери отново.');
    throw e;
  }
}
export async function head(db) {
  return (await first(db, 'SELECT release_id AS id FROM compass_head WHERE slot=1'))?.id ?? baseId;
}
async function objectText(env, key) {
  requireThat(env.BUCKET, 503, 'Липсва хранилището на редакцията.');
  const blob = await env.BUCKET.get(key);
  requireThat(blob, 503, 'Архивът на изданието е недостъпен.');
  return blob.text();
}
export async function loadRelease(env, id) {
  if (id === baseId) return seed;
  const row = await first(
    env.DB,
    'SELECT object_key AS objectKey,digest FROM compass_releases WHERE id=?',
    id,
  );
  requireThat(row, 404, 'Изданието не е намерено.');
  const raw = await objectText(env, row.objectKey);
  requireThat((await digest(raw)) === row.digest, 503, 'Архивът не премина проверката за цялост.');
  return JSON.parse(raw);
}
const proposalSql =
  'SELECT p.id,p.base_id AS baseId,p.entity_id AS entityId,p.evidence_id AS evidenceId,p.question_id AS questionId,p.option_id AS optionId,p.evidence_json AS evidenceJson,p.source_json AS sourceJson,p.reason,p.author,p.created_at AS createdAt,x.release_id AS publishedIn FROM compass_proposals p LEFT JOIN compass_publications x ON x.proposal_id=p.id';
const reviewSql =
  'SELECT proposal_id AS proposalId,actor,decision,adjudicate,source_checked AS sourceChecked,reason,created_at AS createdAt FROM compass_reviews';
function hydrate(p, reviews) {
  const cleaned = reviews.map((r) => ({
    ...r,
    adjudicate: Boolean(r.adjudicate),
    sourceChecked: Boolean(r.sourceChecked),
  }));
  const { evidenceJson, sourceJson, ...row } = p;
  const evidence = evidenceJson ? JSON.parse(evidenceJson) : seed.evidence.find((e) => e.id === p.evidenceId);
  const source = sourceJson ? JSON.parse(sourceJson) : seed.sources.find((s) => s.id === evidence?.sourceId);
  return {
    ...row,
    evidence,
    source,
    reviews: cleaned,
    status: p.publishedIn ? 'published' : reviewStatus(cleaned),
  };
}
export async function workspace(env, actor) {
  const db = env.DB,
    currentReleaseId = await head(db);
  const [rows, reviews, logs, versions, corrections, members] = await Promise.all([
    all(
      db,
      proposalSql + ' WHERE x.release_id IS NULL OR x.release_id=? ORDER BY p.created_at DESC',
      currentReleaseId,
    ),
    all(
      db,
      reviewSql +
        ' WHERE proposal_id IN (SELECT p.id FROM compass_proposals p LEFT JOIN compass_publications x ON p.id=x.proposal_id WHERE x.release_id IS NULL OR x.release_id=?) ORDER BY created_at',
      currentReleaseId,
    ),
    all(
      db,
      'SELECT seq,actor,action,object_id AS objectId,reason,created_at AS createdAt FROM compass_audit ORDER BY seq DESC LIMIT 301',
    ),
    all(
      db,
      'SELECT r.id,r.parent_id AS parentId,r.created_at AS createdAt,(w.release_id IS NOT NULL) AS withdrawn FROM compass_releases r LEFT JOIN compass_withdrawals w ON w.release_id=r.id ORDER BY r.created_at DESC',
    ),
    all(
      db,
      'SELECT rowid AS seq,id,entity_id AS entityId,source_url AS sourceUrl,claim,status,reason,created_at AS createdAt FROM compass_corrections ORDER BY rowid DESC LIMIT 301',
    ),
    actor.role === 'admin'
      ? all(db, 'SELECT user_id AS userId,created_at AS createdAt FROM compass_members ORDER BY user_id')
      : [],
  ]);
  const grouped = Map.groupBy(reviews, (r) => r.proposalId);
  return {
    currentReleaseId,
    proposals: rows.map((p) => ({
      ...hydrate(p, grouped.get(p.id) || []),
      stale: !p.publishedIn && p.baseId !== currentReleaseId,
    })),
    audit: logs.slice(0, 300),
    auditBefore: logs.length > 300 ? logs[299].seq : null,
    releases: [...versions, { id: baseId, parentId: null, createdAt: seed.release.asOf, withdrawn: false }],
    corrections: corrections.slice(0, 300),
    correctionsBefore: corrections.length > 300 ? corrections[299].seq : null,
    members: members.map((m) => ({ ...m, role: 'editor' })),
  };
}
export async function historyPage(db, kind, before) {
  const cursor = before === null ? Number.MAX_SAFE_INTEGER : Number(before);
  requireThat(Number.isSafeInteger(cursor) && cursor > 0, 422, 'Невалиден курсор на страницата.');
  const rows =
    kind === 'audit'
      ? await all(
          db,
          'SELECT seq,actor,action,object_id AS objectId,reason,created_at AS createdAt FROM compass_audit WHERE seq<? ORDER BY seq DESC LIMIT 301',
          cursor,
        )
      : await all(
          db,
          'SELECT rowid AS seq,id,entity_id AS entityId,source_url AS sourceUrl,claim,status,reason,created_at AS createdAt FROM compass_corrections WHERE rowid<? ORDER BY rowid DESC LIMIT 301',
          cursor,
        );
  return { rows: rows.slice(0, 300), before: rows.length > 300 ? rows[299].seq : null };
}
function proposalDigest(base, p) {
  const question = questionBank.get(p.questionId);
  const content = {
    evidenceId: p.evidenceId,
    entityId: p.entityId,
    questionId: p.questionId,
    optionId: p.optionId,
    reason: p.reason,
    evidence: p.evidence,
    source: p.source,
  };
  return digest(
    JSON.stringify([base, content, question?.prompt, question?.options.find((o) => o.id === p.optionId)]),
  );
}
export async function importProposals(env, actor, body) {
  const { mode, package: pkg, token } = body,
    db = env.DB;
  requireThat(mode === 'preview' || mode === 'commit', 422, 'Избери предварителна проверка или запис.');
  let hosts = [];
  try {
    const value = JSON.parse(env.EDITORIAL_SOURCE_HOSTS ?? '[]');
    if (Array.isArray(value)) hosts = value.filter((x) => typeof x === 'string');
  } catch {}
  const current = await loadRelease(env, await head(db)),
    proposals = validatePackage(pkg, current, hosts);
  const raw = JSON.stringify(pkg);
  const key = await digest(raw),
    receipt = await digest(JSON.stringify([actor.userId, key])),
    objectKey = 'imports/' + receipt + '.json';
  const result = { proposals, token: receipt, count: proposals.length };
  requireThat(env.BUCKET, 503, 'Редакторският архив е недостъпен.');
  if (mode === 'preview') {
    await env.BUCKET.put(objectKey, raw, { httpMetadata: { contentType: 'application/json' } });
    return result;
  }
  requireThat(token === receipt, 409, 'Извърши предварителна проверка на същия пакет.');
  requireThat(
    (await objectText(env, objectKey)) === raw,
    409,
    'Провереният пакет се различава от изпратения.',
  );
  if (await first(db, 'SELECT id FROM compass_imports WHERE id=?', receipt)) return result;
  const at = stamp(),
    commands = [
      checkHead(db, pkg.releaseId),
      ...memberGuard(db, actor),
      stmt(
        db,
        'INSERT INTO compass_imports(id,author,base_id,object_key,created_at) VALUES(?,?,?,?,?)',
        receipt,
        actor.userId,
        pkg.releaseId,
        objectKey,
        at,
      ),
    ];
  for (const p of proposals) {
    const id = await proposalDigest(pkg.releaseId, p);
    commands.push(
      stmt(
        db,
        'INSERT OR IGNORE INTO compass_proposals(id,base_id,import_id,author,entity_id,evidence_id,question_id,option_id,reason,created_at,evidence_json,source_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
        id,
        pkg.releaseId,
        receipt,
        actor.userId,
        p.entityId,
        p.evidenceId,
        p.questionId,
        p.optionId,
        p.reason,
        at,
        JSON.stringify(p.evidence),
        JSON.stringify(p.source),
      ),
    );
  }
  commands.push(audit(db, actor.userId, 'import', receipt, 'Предложения: ' + proposals.length, at));
  try {
    await batch(db, commands);
  } catch (e) {
    if (!(await first(db, 'SELECT id FROM compass_imports WHERE id=?', receipt))) throw e;
  }
  return result;
}
async function getProposal(db, id) {
  const row = await first(db, proposalSql + ' WHERE p.id=?', id);
  requireThat(row, 404, 'Предложението не е намерено.');
  return hydrate(row, await all(db, reviewSql + ' WHERE proposal_id=? ORDER BY created_at', id));
}
export async function rebase(env, actor, body) {
  requireThat(boundedText(body.proposalId, 80), 422, 'Посочи предложение.');
  const p = await getProposal(env.DB, body.proposalId),
    doc = await loadRelease(env, await head(env.DB));
  requireThat(
    !p.publishedIn && p.baseId !== doc.release.id,
    409,
    'Предложението е публикувано или вече е за текущото издание.',
  );
  const pkg = {
    format: 'compass-editorial-proposals-v1',
    releaseId: doc.release.id,
    questionVersion: doc.release.questionVersion,
    proposals: [
      { evidenceId: p.evidenceId, questionId: p.questionId, optionId: p.optionId, reason: p.reason },
    ],
  };
  const source = doc.sources.find((s) => s.id === p.source.id);
  if (source)
    requireThat(
      JSON.stringify(source) === JSON.stringify(p.source),
      409,
      'Първоизточникът е променен. Създай ново предложение.',
    );
  else {
    const { id, title, url, kind, publishedAt, retrievedAt, use } = p.source;
    pkg.sources = [{ id, title, url, kind, publishedAt, retrievedAt, use }];
  }
  const evidence = doc.evidence.find((e) => e.id === p.evidence.id);
  if (evidence)
    requireThat(
      JSON.stringify({ ...evidence, status: p.evidence.status }) === JSON.stringify(p.evidence),
      409,
      'Доказателството е променено. Създай ново предложение.',
    );
  else {
    const { id, entityId, sourceId, questionIds, claim, locator, scoreReason } = p.evidence;
    pkg.evidence = [{ id, entityId, sourceId, questionIds, claim, locator, scoreReason }];
  }
  const preview = await importProposals(env, actor, { mode: 'preview', package: pkg });
  return importProposals(env, actor, { mode: 'commit', package: pkg, token: preview.token });
}
export async function reviewProposal(env, actor, body) {
  const db = env.DB,
    id = body.proposalId;
  requireThat(
    boundedText(id, 80) &&
      ['approve', 'reject'].includes(body.decision) &&
      boundedText(body.reason, 2500) &&
      typeof body.sourceChecked === 'boolean' &&
      (body.decision === 'reject' || body.sourceChecked),
    422,
    'Посочи решение и обосновка. Одобрението изисква проверен източник.',
  );
  const p = await getProposal(db, id),
    adj = body.adjudicate === true,
    at = stamp();
  requireThat(p.author !== actor.userId, 403, 'Авторът не може да рецензира собственото предложение.');
  const existing = p.reviews.find((r) => r.actor === actor.userId);
  if (existing) {
    requireThat(
      existing.decision === body.decision &&
        existing.adjudicate === adj &&
        existing.reason === body.reason.trim() &&
        existing.sourceChecked === body.sourceChecked,
      409,
      'Вече има подписана рецензия от този редактор.',
    );
    return { status: p.status };
  }
  requireThat(['disputed', 'pending'].includes(p.status), 409, 'Прегледът на това предложение е приключил.');
  if (adj)
    requireThat(
      p.status === 'disputed' && !p.reviews.some((r) => r.adjudicate),
      409,
      'Арбитраж се извършва при нерешено разминаване.',
    );
  await batch(db, [
    checkHead(db, p.baseId),
    liveGuard(db, p),
    ...memberGuard(db, actor),
    invariant(db, '(SELECT COUNT(*) FROM compass_reviews WHERE proposal_id=?)=?', id, p.reviews.length),
    stmt(
      db,
      'INSERT INTO compass_reviews(proposal_id,actor,decision,adjudicate,reason,source_checked,created_at) VALUES(?,?,?,?,?,?,?)',
      id,
      actor.userId,
      body.decision,
      +adj,
      body.reason.trim(),
      +body.sourceChecked,
      at,
    ),
    audit(
      db,
      actor.userId,
      adj ? 'adjudicate' : 'review',
      id,
      body.decision + ' — ' + body.reason.trim(),
      at,
    ),
  ]);
  return { status: (await getProposal(db, id)).status };
}
async function publicActor(id) {
  return 'editor-' + (await digest('compass-public-editor-v1:' + id)).slice(0, 24);
}
async function projectProposal(doc, p) {
  requireThat(
    (await proposalDigest(p.baseId, p)) === p.id,
    409,
    'Съдържанието се различава от рецензираната ревизия.',
  );
  const listedSource = doc.sources.find((s) => s.id === p.source.id);
  if (listedSource)
    requireThat(
      JSON.stringify(listedSource) === JSON.stringify(p.source),
      422,
      'Конфликт между източници с идентичен идентификатор.',
    );
  else doc.sources.push(structuredClone(p.source));
  let e = doc.evidence.find((e) => e.id === p.evidenceId);
  if (e)
    requireThat(
      JSON.stringify({ ...e, status: p.evidence.status }) === JSON.stringify(p.evidence),
      422,
      'Конфликт между доказателства с идентичен идентификатор.',
    );
  else {
    e = structuredClone(p.evidence);
    doc.evidence.push(e);
  }
  const option = questionBank.get(p.questionId)?.options.find((o) => o.id === p.optionId);
  requireThat(
    e?.entityId === p.entityId && (p.questionId === null || e.questionIds.includes(p.questionId)),
    422,
    'Несъвместим произход.',
  );
  const party = doc.snapshot.parties.find((party) => party.id === p.entityId);
  const attestations = await Promise.all(
    p.reviews.map(async (r) => ({
      reviewerId: await publicActor(r.actor),
      reviewerType: 'human',
      decision: r.decision,
      optionId: p.optionId,
      value: option?.value ?? null,
      questionSetVersion: doc.release.questionVersion,
      reviewedAt: r.createdAt,
      sourceChecked: r.sourceChecked,
      contentHash: p.id,
      rationale: r.reason,
      adjudicate: r.adjudicate,
    })),
  );
  const cell = {
    status: option ? 'approved' : 'unknown',
    optionId: option?.id ?? null,
    value: option?.value ?? null,
    questionSetVersion: doc.release.questionVersion,
    evidenceIds: [p.evidenceId],
    reason: p.reason,
    proposedBy: await publicActor(p.author),
    contentHash: p.id,
    reviews: attestations.filter((r) => !r.adjudicate),
    adjudication: attestations.find((r) => r.adjudicate) ?? null,
  };
  // No inheritance across parties, coalitions or parliamentary groups.
  if (party && p.questionId) party.positions[p.questionId] = cell;
  else {
    doc.otherPositions ??= {};
    doc.otherPositions[[p.entityId, p.questionId ?? p.evidenceId].join('/')] = cell;
  }
  e.status = 'source_checked';
}
export async function publish(env, actor, body) {
  const db = env.DB;
  requireThat(
    Array.isArray(body.proposalIds) &&
      body.proposalIds.length > 0 &&
      body.proposalIds.length <= 150 &&
      body.proposalIds.every((x) => boundedText(x, 80)) &&
      new Set(body.proposalIds).size === body.proposalIds.length &&
      boundedText(body.baseReleaseId, 110),
    422,
    'Избери валидни уникални предложения и версия.',
  );
  const ids = body.proposalIds.toSorted(),
    parent = body.baseReleaseId;
  const releaseId = 'compass-' + (await digest(JSON.stringify([parent, ids]))).slice(0, 40);
  if (await first(db, 'SELECT id FROM compass_releases WHERE id=?', releaseId))
    return { id: releaseId, currentReleaseId: await head(db) };
  requireThat((await head(db)) === parent, 409, 'Текущата версия е променена.');
  const previous = await loadRelease(env, parent),
    document = structuredClone(previous),
    at = stamp(),
    proposals = [];
  const cells = new Set();
  for (const id of ids) {
    const p = await getProposal(db, id);
    requireThat(
      p.status === 'approved' && p.baseId === parent,
      409,
      'Публикуват се само одобрени позиции за текущата версия.',
    );
    const k = JSON.stringify([p.entityId, p.questionId ?? p.evidenceId]);
    requireThat(!cells.has(k), 422, 'Повече от едно предложение за същата партийна позиция.');
    cells.add(k);
    await projectProposal(document, p);
    proposals.push(p);
  }
  const { approved, ranked } = validateSnapshot(document),
    date = at.slice(0, 10);
  Object.assign(document.snapshot, {
    id: releaseId,
    version: releaseId,
    asOf: date,
    status: ranked ? 'published' : 'research_incomplete',
  });
  Object.assign(document.release, {
    id: releaseId,
    sourceSnapshotVersion:
      JSON.stringify([previous.sources, previous.evidence]) === JSON.stringify([document.sources, document.evidence])
        ? previous.release.sourceSnapshotVersion
        : 'sources-' + releaseId,
    partyDatasetVersion: releaseId,
    asOf: date,
    partyRankingEnabled: ranked,
    partyRankingDisabledReason: ranked ? null : 'Недостатъчно сравнимо покритие от проверени позиции.',
    publishedAt: at,
    parentId: parent,
  });
  Object.assign(document.release.counts, {
    approvedPositions: approved,
    sources: document.sources.length,
    evidenceRecords: document.evidence.length,
  });
  const raw = JSON.stringify(document),
    hash = await digest(raw),
    objectKey = 'releases/' + hash + '.json';
  await env.BUCKET.put(objectKey, raw, { httpMetadata: { contentType: 'application/json' } });
  const commands = [
    checkHead(db, parent),
    stmt(
      db,
      'INSERT INTO compass_releases(id,parent_id,object_key,digest,actor,created_at) VALUES(?,?,?,?,?,?)',
      releaseId,
      parent,
      objectKey,
      hash,
      actor.userId,
      at,
    ),
  ];
  for (const p of proposals) {
    commands.push(
      liveGuard(db, p),
      invariant(db, '(SELECT COUNT(*) FROM compass_reviews WHERE proposal_id=?)=?', p.id, p.reviews.length),
      stmt(db, 'INSERT INTO compass_publications(proposal_id,release_id) VALUES(?,?)', p.id, releaseId),
    );
  }
  commands.push(
    stmt(
      db,
      'INSERT INTO compass_head(slot,release_id) VALUES(1,?) ON CONFLICT(slot) DO UPDATE SET release_id=excluded.release_id',
      releaseId,
    ),
    audit(db, actor.userId, 'publish', releaseId, 'Предходно издание: ' + parent, at),
  );
  try {
    await batch(db, commands);
  } catch (e) {
    if (!(await first(db, 'SELECT id FROM compass_releases WHERE id=?', releaseId))) throw e;
  }
  return { id: releaseId, currentReleaseId: await head(db) };
}
export async function withdraw(env, actor, body) {
  const db = env.DB,
    id = body.releaseId,
    reason = body.reason;
  requireThat(
    boundedText(id, 110) && boundedText(reason, 2500) && id !== baseId,
    422,
    'Посочи публикувано издание и причина.',
  );
  const row = await first(db, 'SELECT parent_id AS parentId FROM compass_releases WHERE id=?', id);
  requireThat(row, 404, 'Изданието не е намерено.');
  if (await first(db, 'SELECT release_id FROM compass_withdrawals WHERE release_id=?', id))
    return { currentReleaseId: await head(db) };
  const at = stamp();
  await batch(db, [
    checkHead(db, id),
    stmt(
      db,
      'INSERT INTO compass_withdrawals(release_id,actor,reason,created_at) VALUES(?,?,?,?)',
      id,
      actor.userId,
      reason.trim(),
      at,
    ),
    stmt(db, 'UPDATE compass_head SET release_id=? WHERE slot=1', row.parentId),
    audit(db, actor.userId, 'withdraw', id, reason.trim(), at),
  ]);
  return { currentReleaseId: row.parentId };
}

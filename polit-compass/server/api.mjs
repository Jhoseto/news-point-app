import { ApiError, boundedText, digest, questionBank, requireThat, seed, sourceUrlAllowed } from './editorial-data.mjs';
import {
  audit,
  batch,
  first,
  head,
  historyPage,
  importProposals,
  loadRelease,
  publish,
  rebase,
  reviewProposal,
  stmt,
  withdraw,
  workspace,
} from './editorial-store.mjs';

const privateHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};
const reply = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { ...privateHeaders, ...headers } });
function list(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim())
      : [];
  } catch {
    return [];
  }
}
async function identify(request, env) {
  // Only the Sites Dispatch entry (or the authenticated local adapter) calls this
  // interface. Never deploy this handler behind an untrusted header passthrough.
  const userId = request.headers.get('oai-authenticated-user-id'),
    email = request.headers.get('oai-authenticated-user-email');
  if (!boundedText(userId, 256) || !boundedText(email, 320))
    return { authenticated: false, userId: null, role: null };
  const isAdmin =
    list(env.EDITORIAL_ADMINS).includes(userId) ||
    list(env.EDITORIAL_ADMIN_EMAILS).some((e) => e.toLowerCase() === email.trim().toLowerCase());
  const role = isAdmin
    ? 'admin'
    : (await first(env.DB, 'SELECT user_id FROM compass_members WHERE user_id=?', userId))
      ? 'editor'
      : null;
  return { authenticated: true, userId, role };
}
async function readJson(request) {
  const origin = request.headers.get('origin');
  requireThat(
    origin === new URL(request.url).origin && request.headers.get('sec-fetch-site') !== 'cross-site',
    403,
    'Заявката трябва да е от самото приложение.',
  );
  requireThat(
    request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() === 'application/json',
    415,
    'Изисква се JSON.',
  );
  const maximum = 524288;
  requireThat(
    Number(request.headers.get('content-length') || 0) <= maximum,
    413,
    'Данните надвишават 512 KB.',
  );
  const reader = request.body?.getReader();
  requireThat(reader, 400, 'Празна заявка.');
  const chunks = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maximum) {
      await reader.cancel();
      throw new ApiError(413, 'Данните надвишават 512 KB.');
    }
    chunks.push(value);
  }
  let data;
  try {
    data = JSON.parse(await new Blob(chunks).text());
  } catch {
    throw new ApiError(400, 'Невалиден JSON.');
  }
  requireThat(data !== null && typeof data === 'object' && !Array.isArray(data), 422, 'Невалиден обект.');
  return data;
}
function onlyKeys(body, keys) {
  requireThat(
    Object.keys(body).every((k) => keys.includes(k)),
    422,
    'Заявката съдържа непознати полета.',
  );
}
async function memberAction(env, actor, body) {
  onlyKeys(body, ['userId', 'role']);
  requireThat(
    boundedText(body.userId, 256) && [null, 'editor'].includes(body.role),
    422,
    'Посочи идентификатор на потребител и допустима роля.',
  );
  const id = body.userId.trim(),
    at = new Date().toISOString();
  requireThat(
    id !== actor.userId && !list(env.EDITORIAL_ADMINS).includes(id),
    422,
    'Ролята на този администратор се управлява от настройките на сайта.',
  );
  const exists = Boolean(await first(env.DB, 'SELECT user_id FROM compass_members WHERE user_id=?', id));
  if (exists === (body.role === 'editor')) return { userId: id, role: body.role };
  await batch(env.DB, [
    body.role === 'editor'
      ? stmt(
          env.DB,
          'INSERT INTO compass_members(user_id,granted_by,created_at) VALUES(?,?,?)',
          id,
          actor.userId,
          at,
        )
      : stmt(env.DB, 'DELETE FROM compass_members WHERE user_id=?', id),
    audit(env.DB, actor.userId, body.role ? 'grant' : 'revoke', id, 'editor', at),
  ]);
  return { userId: id, role: body.role };
}
async function correct(request, env, body) {
  onlyKeys(body, ['entityId', 'claim', 'sourceUrl']);
  requireThat(
    boundedText(body.claim, 2500) &&
      boundedText(body.sourceUrl, 2048) &&
      sourceUrlAllowed(body.sourceUrl) &&
      (!body.entityId || seed.entities.some((e) => e.id === body.entityId)),
    422,
    'Необходими са конкретно описание и валиден HTTP(S) адрес.',
  );
  const sourceUrl = new URL(body.sourceUrl).href,
    claim = body.claim.trim(),
    entityId = body.entityId || null;
  const id = 'cor-' + (await digest(JSON.stringify([sourceUrl, claim, entityId]))).slice(0, 32),
    db = env.DB;
  const prior = await first(db, 'SELECT id,status FROM compass_corrections WHERE id=?', id);
  if (prior) return prior;
  const time = Date.now(),
    hour = Math.floor(time / 3600000);
  // Dispatch supplies CF-Connecting-IP. No client-provided forwarding chain or
  // raw address is stored. Unknown origins share a conservative hourly bucket.
  const origin = request.headers.get('cf-connecting-ip') || 'unknown';
  const bucket = await digest(JSON.stringify(['correction', hour, origin]));
  const at = new Date(time).toISOString();
  try {
    await db.batch([
      stmt(db, 'DELETE FROM compass_limits WHERE expires_at<=?', time),
      stmt(
        db,
        'INSERT INTO compass_limits(bucket,count,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1',
        bucket,
        (hour + 1) * 3600000,
      ),
      stmt(
        db,
        'INSERT INTO compass_corrections(id,entity_id,source_url,claim,created_at) VALUES(?,?,?,?,?)',
        id,
        entityId,
        sourceUrl,
        claim,
        at,
      ),
    ]);
  } catch (e) {
    const prior = await first(db, 'SELECT id,status FROM compass_corrections WHERE id=?', id);
    if (prior) return prior;
    const limit = await first(db, 'SELECT count FROM compass_limits WHERE bucket=?', bucket);
    if (limit?.count >= 10)
      throw new ApiError(429, 'Лимитът е 10 различни сигнала на час. Опитай отново по-късно.');
    throw e;
  }
  return { id, status: 'open' };
}
async function triage(env, actor, body) {
  onlyKeys(body, ['id', 'status', 'reason']);
  requireThat(
    boundedText(body.id, 64) &&
      ['resolved', 'declined'].includes(body.status) &&
      boundedText(body.reason, 2500),
    422,
    'Посочи решение и основание.',
  );
  const db = env.DB,
    row = await first(db, 'SELECT status,reason FROM compass_corrections WHERE id=?', body.id),
    reason = body.reason.trim();
  requireThat(row, 404, 'Сигналът не е намерен.');
  if (row.status === body.status && row.reason === reason) return { id: body.id, status: body.status };
  requireThat(row.status === 'open', 409, 'Сигналът вече е приключен.');
  const at = new Date().toISOString();
  await batch(db, [
    ...(actor.role === 'editor'
      ? [
          stmt(
            db,
            'INSERT INTO compass_guard(ok) SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM compass_members WHERE user_id=?)',
            actor.userId,
          ),
        ]
      : []),
    stmt(
      db,
      "INSERT INTO compass_guard(ok) SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM compass_corrections WHERE id=? AND status='open')",
      body.id,
    ),
    stmt(
      db,
      "UPDATE compass_corrections SET status=?, reason=? WHERE id=? AND status='open'",
      body.status,
      reason,
      body.id,
    ),
    audit(db, actor.userId, 'correction-' + body.status, body.id, reason, at),
  ]);
  return { id: body.id, status: body.status };
}
async function publicRead(request, env, path) {
  let id = null,
    kind = 'release',
    key = null;
  const current = path === '/api/releases/current' || path === '/api/public/release';
  if (current) id = await head(env.DB);
  else if (/^\/api\/releases\/[\w-]+$/.test(path)) id = path.split('/').at(-1);
  else if (/^\/api\/(sources|entities)\/[\w-]+$/.test(path)) {
    [, , kind, key] = path.split('/');
    id = await head(env.DB);
  } else throw new ApiError(404, 'Няма такава публична справка.');
  const etag = '"' + id + '"',
    headers = { ETag: etag, 'Cache-Control': 'private, no-cache' },
    matches = request.headers.get('if-none-match') === etag;
  if (current && matches) return new Response(null, { status: 304, headers });
  const document = await loadRelease(env, id);
  if (kind === 'sources') {
    const source = document.sources.find((s) => s.id === key);
    requireThat(source, 404, 'Източникът не е намерен.');
    return reply({ source, evidence: document.evidence.filter((e) => e.sourceId === key) });
  }
  if (kind === 'entities') {
    const entity = document.entities.find((e) => e.id === key);
    requireThat(entity, 404, 'Субектът не е намерен.');
    const party = document.snapshot.parties.find((p) => p.id === key);
    const positions = party?.positions ?? Object.fromEntries(
      [...questionBank.keys()]
        .map((qid) => [qid, document.otherPositions?.[key + '/' + qid]])
        .filter(([, cell]) => cell),
    );
    const approved = Object.values(positions).filter((p) => p.status === 'approved').length;
    return reply({
      entity,
      coverage: { approved, total: questionBank.size },
      evidence: document.evidence.filter((e) => e.entityId === key),
      positions,
    });
  }
  return matches
    ? new Response(null, { status: 304, headers })
    : reply(document, 200, headers);
}
export async function handleApi(request, env, ctx) {
  try {
    const path = new URL(request.url).pathname.replace(/\/$/, '');
    if (path === '/api/admin/session' && request.method === 'GET') {
      const actor = await identify(request, env);
      return reply({
        ...actor,
        authProvider: env.COMPASS_AUTH_PROVIDER === 'local' ? 'local' : 'sites',
        signInPath: env.COMPASS_SIGN_IN_PATH || '/signin-with-chatgpt?return_to=%2F%23editor',
        signOutPath: env.COMPASS_SIGN_OUT_PATH || '/signout-with-chatgpt?return_to=%2F%23editor',
      });
    }
    requireThat(env.DB, 503, 'Редакторската база е недостъпна.');
    if (!path.startsWith('/api/admin/')) {
      if (path === '/api/corrections') {
        requireThat(request.method === 'POST', 405, 'Използвай POST.');
        return reply(await correct(request, env, await readJson(request)), 201);
      }
      requireThat(request.method === 'GET', 405, 'Използвай GET.');
      return await publicRead(request, env, path);
    }
    const actor = await identify(request, env);
    requireThat(actor.authenticated, 401, 'Влез с ChatGPT.');
    requireThat(actor.role, 403, 'Необходима е редакторска роля.');
    if (path === '/api/admin/workspace') {
      requireThat(request.method === 'GET', 405, 'Използвай GET.');
      return reply(await workspace(env, actor));
    }
    if (path === '/api/admin/audit' || path === '/api/admin/corrections') {
      requireThat(request.method === 'GET', 405, 'Използвай GET.');
      return reply(
        await historyPage(env.DB, path.split('/').at(-1), new URL(request.url).searchParams.get('before')),
      );
    }
    requireThat(request.method === 'POST', 405, 'Използвай POST.');
    const body = await readJson(request);
    switch (path) {
      case '/api/admin/import':
        onlyKeys(body, ['mode', 'package', 'token']);
        return reply(await importProposals(env, actor, body));
      case '/api/admin/rebase':
        onlyKeys(body, ['proposalId']);
        return reply(await rebase(env, actor, body));
      case '/api/admin/review':
        onlyKeys(body, ['proposalId', 'decision', 'reason', 'sourceChecked', 'adjudicate']);
        return reply(await reviewProposal(env, actor, body));
      case '/api/admin/correction':
        return reply(await triage(env, actor, body));
      case '/api/admin/members':
      case '/api/admin/publish':
      case '/api/admin/withdraw':
        requireThat(actor.role === 'admin', 403, 'Необходима е администраторска роля.');
        if (path.endsWith('/members')) return reply(await memberAction(env, actor, body));
        if (path.endsWith('/publish')) {
          onlyKeys(body, ['proposalIds', 'baseReleaseId']);
          return reply(await publish(env, actor, body));
        }
        onlyKeys(body, ['releaseId', 'reason']);
        return reply(await withdraw(env, actor, body));
      default:
        throw new ApiError(404, 'Няма такъв редакторски адрес.');
    }
  } catch (e) {
    if (e instanceof ApiError)
      return reply({ error: e.message, ...(e.issues ? { issues: e.issues } : {}) }, e.status);
    return reply({ error: 'Редакторското хранилище временно е недостъпно.' }, 503);
  }
}

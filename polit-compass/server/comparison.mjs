import { randomInt } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const validCode = code => typeof code === 'string' && /^[A-HJ-NP-Z2-9]{6}$/.test(code);
const reply = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
let start = 0, attempts = 0;

function vector(items, size, min) {
  return Array.isArray(items) && items.length === size &&
    items.every(n => n === null || (Number.isInteger(n) && n >= min && n <= 100));
}
function snapshotText(value) {
  if (value?.version !== 1 || Object.keys(value).length !== 3 || !vector(value.axes, 10, -100) || !vector(value.parties, 6, 0)) return null;
  return JSON.stringify({ version: 1, axes: value.axes, parties: value.parties });
}
function save(db, key, snapshot) {
  const insert = db.prepare('INSERT INTO summaries(code,request_key,snapshot) VALUES(?,?,?) ON CONFLICT DO NOTHING');
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
    if (insert.run(code, key, snapshot).changes) return code;
    const previous = db.prepare('SELECT code FROM summaries WHERE request_key=? AND snapshot=?').get(key,snapshot);
    if (previous) return previous.code;
  }
  throw new Error('Code unavailable');
}
export async function compareRequest(request, directory) {
  if (request.method !== 'POST') return reply(null, 405);
  if (request.headers.get('origin') !== 'http://localhost:3000' || !request.headers.get('content-type')?.startsWith('application/json')) return reply(null, 403);
  if (Date.now() - start >= 60_000) { start = Date.now(); attempts = 0; }
  if (++attempts > 60) return reply(null, 429);
  let text = '', bytes = 0;
  const decoder = new TextDecoder();
  for await (const chunk of request.body ?? []) {
    bytes += chunk.length;
    if (bytes > 1024) return reply(null, 413);
    text += decoder.decode(chunk, {stream:true});
  }
  let data;
  try { data = JSON.parse(text + decoder.decode()); } catch { return reply(null, 400); }
  const snapshot = snapshotText(data?.snapshot);
  const write = snapshot && typeof data.key === 'string' && /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(data.key);
  const codes = data?.codes;
  if (!write && !(Array.isArray(codes) && codes.length === 2 && codes.every(validCode) && codes[0] !== codes[1])) return reply(null, 400);
  let db;
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    db = new DatabaseSync(join(directory, 'comparisons.sqlite'));
    db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS summaries(code TEXT PRIMARY KEY, request_key TEXT NOT NULL, snapshot TEXT NOT NULL, UNIQUE(request_key,snapshot))');
    if (write) return reply({code: save(db, data.key, snapshot)});
    const rows = db.prepare('SELECT code,snapshot FROM summaries WHERE code IN (?,?)').all(...codes);
    if (rows.length !== 2) return reply(null,404);
    return reply(codes.map(c => JSON.parse(rows.find(row => row.code === c).snapshot)));
  } catch { return reply(null,503); } finally { db?.close(); }
}

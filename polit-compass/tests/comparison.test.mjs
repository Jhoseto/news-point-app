import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { compareRequest } from '../server/comparison.mjs';

test('two readers compare immutable reports using codes only', async t => {
  const directory = await mkdtemp(join(tmpdir(),'compass-comparison-'));
  t.after(() => rm(directory,{recursive:true,force:true}));
  const call = (body, origin = 'http://localhost:3000') => compareRequest(new Request(origin+'/polit-compass/compare/',{
    method:'POST', headers:{origin,'content-type':'application/json'}, body:JSON.stringify(body),
  }),directory);
  const key = randomUUID();
  const snapshot = {version:1, axes:Array(10).fill(null), parties:Array(6).fill(null)};
  const revised = {...snapshot,axes:Array(10).fill(25)};
  const persist = async (id, data) => (await (await call({key:id,snapshot:data})).json()).code;
  const first = await persist(key,snapshot);
  assert.match(first,/^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(await persist(key,snapshot),first);
  const second = await persist(randomUUID(),revised);
  assert.notEqual(await persist(key,revised),first);
  assert.deepEqual(await (await call({codes:[second,first]})).json(),[revised,snapshot]);
  assert.equal((await call({codes:[first,first]})).status,400);
  assert.equal((await call({codes:[first,'ZZZZZZ']})).status,404);
  assert.equal((await call({key,snapshot:{...snapshot,email:'unexpected'}})).status,400);
  assert.equal((await call({key,snapshot},'https://elsewhere.example')).status,403);
});

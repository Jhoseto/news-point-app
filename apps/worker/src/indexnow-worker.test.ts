import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { SQL } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { ScriptDb } from "@newspoint/db/node";
import { claimIndexNowJobs, deliverIndexNowJobs, startIndexNowWorker } from "./indexnow-worker";

// Explicit isolated fixtures. Never loads .env.local, a live DB or the real IndexNow endpoint.
let pg: PGlite;
let db: ScriptDb;
let id: string;
const migration = readFileSync("packages/db/migrations/42_indexnow.sql", "utf8");
const config = { origin: "https://example.com", key: "fixture-key-123456", keyLocation: "https://example.com/indexnow-key.txt" };
const path = "/explicit-test-article/";
// Run real PostgreSQL SQL; adapt only the driver's result envelope to postgres-js.
type TestConnection = Pick<ReturnType<typeof drizzle>, "execute" | "transaction">;
function postgresRows(connection: TestConnection): ScriptDb {
  return {
    execute: async (query: SQL) => (await connection.execute(query)).rows,
    transaction: (callback: (tx: ScriptDb) => Promise<unknown>) =>
      connection.transaction(tx => callback(postgresRows(tx))),
  } as unknown as ScriptDb;
}
async function event(version = 1, visible?: boolean) {
  await pg.query(`insert into outbox_events(type,entity_id,version,payload) values($1,$2,$3,$4)`,
    [version === 1 ? "article.published" : "article.updated", id, version,
      JSON.stringify({ path, ...(visible === undefined ? {} : { visibilityChange: { visible } }) })]);
}
async function due() { await pg.exec("update indexnow_jobs set due_at=now()-interval '1 second'"); }
async function job() { return (await pg.query<Record<string, unknown>>("select * from indexnow_jobs")).rows[0]; }
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`create table articles(id uuid primary key,path text,is_public boolean,published_at timestamptz);
    create table editor_qa_articles(article_id uuid primary key);`);
  await pg.exec(readFileSync("packages/db/migrations/06_outbox.sql", "utf8"));
  await pg.exec(migration);
  db = postgresRows(drizzle(pg));
}, 30000);
beforeEach(async () => {
  await pg.exec("truncate indexnow_jobs,outbox_events,editor_qa_articles,articles cascade");
  id = randomUUID();
  await pg.query("insert into articles(id,path,is_public,published_at) values($1,$2,true,now()-interval '1 minute')", [id,path]);
});
afterAll(async () => { await pg?.close(); });
afterEach(() => vi.unstubAllEnvs());

it("queues committed publication and rolls back notifications with publication", async () => {
  await pg.exec("begin"); await event(); await pg.exec("rollback");
  expect(await job()).toBeUndefined();
  await event();
  expect(await job()).toMatchObject({ path, status: "pending", attempts: 0 });
  expect(await claimIndexNowJobs(db)).toHaveLength(0); // debounce window
});

it("coalesces edits, rejects duplicate/older versions and covers hide/show", async () => {
  await event(); await event(2); await event(2); await event(1);
  expect(await job()).toMatchObject({ generation: 2, version: 2 });
  await pg.exec("update articles set is_public=false"); await event(3, false);
  expect(await job()).toMatchObject({ version: 3 });
  await pg.exec("update articles set is_public=true"); await event(4, true);
  expect(await job()).toMatchObject({ version: 4 });
  expect((await pg.query("select * from indexnow_jobs")).rows).toHaveLength(1);
});

it("never queues drafts, scheduled future articles or registered editor QA", async () => {
  await pg.exec("update articles set published_at=null,is_public=false"); await event(); await event(2,false);
  expect(await job()).toBeUndefined();
  await pg.exec("update articles set published_at=now()+interval '1 hour',is_public=true"); await event(3);
  expect(await job()).toBeUndefined();
  await pg.exec("update articles set published_at=now()-interval '1 minute'");
  await pg.query("insert into editor_qa_articles values($1)", [id]); await event(4);
  expect(await job()).toBeUndefined();
});

it("retains removal notification when the article and its outbox are deleted", async () => {
  await event(2,false);
  await pg.query("delete from articles where id=$1",[id]);
  expect((await pg.query("select * from outbox_events")).rows).toHaveLength(0);
  await due(); const jobs = await claimIndexNowJobs(db);
  const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null,{ status: 202 }));
  expect(await deliverIndexNowJobs(db,jobs,config,send)).toEqual({accepted:1,retried:0,failed:0});
  expect(await job()).toMatchObject({status:"accepted",last_status:202});
  const body = JSON.parse(send.mock.calls[0]![1]!.body as string);
  expect(body).toEqual({host:"example.com",key:config.key,keyLocation:config.keyLocation,urlList:[config.origin+path]});
});

it("reclaims expired leases after restart and prevents stale acknowledgment", async () => {
  await event(); await due(); const old = await claimIndexNowJobs(db);
  expect(await claimIndexNowJobs(db)).toHaveLength(0);
  await pg.exec("update indexnow_jobs set lease_until=now()-interval '1 second'");
  const newer = await claimIndexNowJobs(db);
  expect(newer[0]!.lease_token).not.toBe(old[0]!.lease_token);
  const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null,{status:200}));
  expect((await deliverIndexNowJobs(db,old,config,send)).accepted).toBe(0);
  expect(await job()).toMatchObject({status:"sending",attempts:2});
  await deliverIndexNowJobs(db,newer,config,send);
  expect(await job()).toMatchObject({status:"accepted"});
});

it("does not lose a newer edit committed during the HTTP request", async () => {
  await event(); await due(); const jobs=await claimIndexNowJobs(db);
  const send=vi.fn<typeof fetch>().mockImplementation(async () => { await event(2); return new Response(null,{status:200}); });
  await deliverIndexNowJobs(db,jobs,config,send);
  expect(await job()).toMatchObject({status:"pending",version:2,generation:2,attempts:0});
});

it.each([429,503])("retries %s durably and honors Retry-After", async status => {
  await event(); await due();
  const jobs=await claimIndexNowJobs(db);
  const send=vi.fn<typeof fetch>().mockResolvedValue(new Response(null,{status,headers:{"retry-after":"600"}}));
  expect((await deliverIndexNowJobs(db,jobs,config,send)).retried).toBe(1);
  const row=await job();
  expect(row).toMatchObject({status:"pending",attempts:1,last_status:status,lease_token:null});
  expect(new Date(row!.due_at as string).getTime()).toBeGreaterThan(Date.now()+590_000);
});

it("retries transport failures but stops permanent rejection and resets on a new edit", async () => {
  await event(); await due();
  await deliverIndexNowJobs(db,await claimIndexNowJobs(db),config,vi.fn<typeof fetch>().mockRejectedValue(new Error("fixture timeout")));
  expect(await job()).toMatchObject({status:"pending",error_code:"transport_error"});
  await due();
  await deliverIndexNowJobs(db,await claimIndexNowJobs(db),config,vi.fn<typeof fetch>().mockResolvedValue(new Response(null,{status:403})));
  expect(await job()).toMatchObject({status:"failed",error_code:"http_403"});
  await event(2); expect(await job()).toMatchObject({status:"pending",attempts:0,error_code:null});
});

it("does not replay historical events or accepted jobs on migration rerun", async () => {
  await event(); await due();
  await deliverIndexNowJobs(db,await claimIndexNowJobs(db),config,vi.fn<typeof fetch>().mockResolvedValue(new Response(null,{status:200})));
  await pg.exec(migration); expect(await claimIndexNowJobs(db)).toHaveLength(0);
  await pg.exec("delete from indexnow_jobs"); await pg.exec(migration);
  expect(await job()).toBeUndefined();
});

it("does no database work while disabled and shuts down without a timer", async () => {
  vi.stubEnv("NP_INDEXNOW_ENABLED", "0");
  const execute = vi.fn();
  const stop = startIndexNowWorker({ execute } as unknown as ScriptDb, vi.fn());
  await stop();
  expect(execute).not.toHaveBeenCalled();
});

it("stops after ten failed attempts and never sends an invalid private path", async () => {
  await event(); await due();
  await pg.exec("update indexnow_jobs set attempts=9");
  const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, {status:503}));
  expect((await deliverIndexNowJobs(db,await claimIndexNowJobs(db),config,send)).failed).toBe(1);
  expect(await job()).toMatchObject({status:"failed",attempts:10});
  expect(await claimIndexNowJobs(db)).toHaveLength(0);
  await event(2); await due();
  await pg.exec("update indexnow_jobs set path='/admin/'");
  send.mockClear();
  await deliverIndexNowJobs(db,await claimIndexNowJobs(db),config,send);
  expect(send).not.toHaveBeenCalled();
  expect(await job()).toMatchObject({status:"failed",error_code:"invalid_public_path"});
});

it("queues scheduled publication only after it becomes public, not private edits", async () => {
  await pg.exec("update articles set published_at=now()+interval '1 hour'");
  await event(); expect(await job()).toBeUndefined();
  await pg.exec("update articles set published_at=now()-interval '1 second'");
  await event(2); expect(await job()).toMatchObject({version:2});
  await pg.exec("update articles set is_public=false");
  await event(3); expect(await job()).toMatchObject({version:2});
  await event(4,false); expect(await job()).toMatchObject({version:4});
});

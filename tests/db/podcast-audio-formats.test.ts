import {expect,it} from "vitest";
import {PGlite} from "@electric-sql/pglite";
import {readFile} from "node:fs/promises";
it("migration 35 retains MP3 and permits only safe M4A keys",async()=>{
  const db=new PGlite();
  try {
    await db.exec("create table categories(id uuid primary key); create table staff_users(id text primary key);");
    await db.exec(await readFile("packages/db/migrations/22_podcasts.sql","utf8"));
    const insert=(audio:string)=>db.query("insert into podcasts(title,slug,summary,cover_key,audio_key,duration_sec,bytes) values('Fixture','fixture-'||substr(md5(random()::text),1,8),'Fixture summary','podcasts/2026/10/abcd.webp',$1,60,100)",[audio]);
    await insert("podcasts/2026/10/abcd.mp3");
    await expect(insert("podcasts/2026/10/abcd.m4a")).rejects.toThrow();
    await db.exec(await readFile("packages/db/migrations/35_podcast_audio_formats.sql","utf8"));
    await insert("podcasts/2026/10/abcd.m4a");
    await expect(insert("podcasts/../private.m4a")).rejects.toThrow();
    await expect(insert("podcasts/2026/10/abcd.wav")).rejects.toThrow();
    const rows=await db.query<{count:number}>("select count(*)::int as count from podcasts");expect(rows.rows[0]?.count).toBe(2);
  } finally {await db.close();}
},30_000);

it("migration 36 preserves episodes and permits exactly 100 MiB stored audio",async()=>{
  const db=new PGlite();
  try {
    await db.exec("create table categories(id uuid primary key); create table staff_users(id text primary key);");
    await db.exec(await readFile("packages/db/migrations/22_podcasts.sql","utf8"));
    const insert=(slug:string,bytes:number)=>db.query("insert into podcasts(title,slug,summary,cover_key,audio_key,duration_sec,bytes) values('Fixture',$1,'Fixture summary','podcasts/2026/10/abcd.webp','podcasts/2026/10/abcd.mp3',60,$2)",[slug,bytes]);
    await insert("existing-fixture",100);
    await expect(insert("large-fixture",100*1024*1024)).rejects.toThrow();
    await db.exec(await readFile("packages/db/migrations/36_podcast_audio_size.sql","utf8"));
    await insert("large-fixture",100*1024*1024);
    await expect(insert("too-large-fixture",100*1024*1024+1)).rejects.toThrow();
    await expect(insert("empty-fixture",0)).rejects.toThrow();
    const rows=await db.query<{slug:string;bytes:number}>("select slug,bytes from podcasts order by bytes");
    expect(rows.rows).toEqual([{slug:"existing-fixture",bytes:100},{slug:"large-fixture",bytes:100*1024*1024}]);
  } finally {await db.close();}
},30_000);

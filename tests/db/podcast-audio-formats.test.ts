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

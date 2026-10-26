import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(import.meta.dirname, "../migrations/41_city_guide_sources.sql"), "utf8");

describe("city-guide migration", () => {
  it("creates hidden evidence tables and enforces the publication gate", async () => {
    const db = new PGlite();
    try {
      await db.exec(migration);
      await db.exec(migration);
      const tables = await db.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema='public' and table_name like 'city_%' order by table_name");
      expect(tables.rows.map(row => row.table_name)).toEqual(["city_record_versions", "city_records", "city_source_checks", "city_sources"]);
      await db.query("insert into city_sources(id,category,source_url,format) values ($1,$2,$3,$4)", ["plovdiv-gallery-current", "events", "https://galleryplovdiv.com/current", "html"]);
      const source = await db.query<{ review_state: string; publication_state: string }>("select review_state, publication_state from city_sources where id='plovdiv-gallery-current'");
      expect(source.rows[0]).toEqual({ review_state: "pilot", publication_state: "hidden" });
      await expect(db.exec("update city_sources set publication_state='visible' where id='plovdiv-gallery-current'")).rejects.toThrow();
      await db.exec("update city_sources set review_state='accepted', publication_state='visible' where id='plovdiv-gallery-current'");
      const rls = await db.query<{ relname: string; relrowsecurity: boolean }>("select relname, relrowsecurity from pg_class where relname like 'city_%' and relkind='r'");
      expect(rls.rows).toHaveLength(4);
      expect(rls.rows.every(row => row.relrowsecurity)).toBe(true);
    } finally {
      await db.close();
    }
  });
});

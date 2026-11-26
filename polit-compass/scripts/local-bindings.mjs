import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export function localDatabase(sqlite) {
  function prepare(sql, values = []) {
    const statement = sqlite.prepare(sql);
    const read = () => statement.all(...values);
    const execute = () => {
      if (statement.columns().length) return { success: true, results: read(), meta: { changes: 0 } };
      const change = statement.run(...values);
      return { success: true, results: [], meta: { changes: Number(change.changes), last_row_id: Number(change.lastInsertRowid) } };
    };
    return {
      bind: (...args) => prepare(sql, args),
      first(column) {
        const row = statement.get(...values);
        if (!row) return null;
        return column === undefined ? row : row[column];
      },
      all: execute,
      run: execute,
    };
  }
  return {
    prepare,
    batch(statements) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map(statement => statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

async function migrate(db, directory) {
  const journal = JSON.parse(await readFile(path.join(directory, "meta", "_journal.json"), "utf8"));
  db.exec("CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL)");
  for (const migration of journal.entries) {
    const sql = await readFile(path.join(directory, migration.tag + ".sql"), "utf8");
    const checksum = createHash("sha256").update(sql.replaceAll("\r\n", "\n")).digest("hex");
    db.exec("BEGIN IMMEDIATE");
    try {
      const previous = db.prepare("SELECT checksum FROM local_migrations WHERE name = ?").get(migration.tag);
      if (previous && previous.checksum !== checksum) throw new Error("Previously applied local migration was modified: " + migration.tag);
      if (!previous) {
        db.exec(sql);
        db.prepare("INSERT INTO local_migrations (name, checksum) VALUES (?, ?)").run(migration.tag, checksum);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

export async function openLocalBindings(directory, migrations) {
  const objectDirectory = path.join(directory, "objects");
  await mkdir(objectDirectory, { recursive: true, mode: 0o700 });
  const sqlite = new DatabaseSync(path.join(directory, "editorial.sqlite"));
  try {
    sqlite.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
    await migrate(sqlite, migrations);
  } catch (error) {
    sqlite.close();
    throw error;
  }
  const filename = (key) => path.join(objectDirectory, createHash("sha256").update(key).digest("hex"));
  const bucket = {
    async put(key, value) {
      const target = filename(key);
      const temp = target + "." + randomUUID() + ".tmp";
      await writeFile(temp, value, { flag: "wx", mode: 0o600 });
      await rename(temp, target);
      return { key };
    },
    async get(key) {
      try {
        const bytes = await readFile(filename(key));
        return { key, size: bytes.length, text: async () => bytes.toString("utf8") };
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    },
  };
  return { DB: localDatabase(sqlite), BUCKET: bucket, close: () => sqlite.close() };
}

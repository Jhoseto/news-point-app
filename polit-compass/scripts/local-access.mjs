import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

export const stateDirectory = process.env.COMPASS_LOCAL_DIR
  ? path.resolve(process.env.COMPASS_LOCAL_DIR)
  : fileURLToPath(new URL("../.compass-local/", import.meta.url));
export const owner = { id: "local-owner", email: "local-owner@localhost.invalid" };
const derive = promisify(scrypt);
const digest = token => createHash("sha256").update(token).digest("hex");

export function openLocalAccess(directory = stateDirectory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(directory, "access.sqlite"));
  db.exec(`
    PRAGMA busy_timeout=5000;
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS local_instance (slot INTEGER PRIMARY KEY, secret TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS local_tickets (digest TEXT PRIMARY KEY, expiry INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS local_sessions (digest TEXT PRIMARY KEY, id TEXT NOT NULL, email TEXT NOT NULL, expiry INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS local_accounts (id TEXT PRIMARY KEY, email TEXT NOT NULL, salt TEXT NOT NULL, proof TEXT NOT NULL);
  `);
  db.prepare("INSERT OR IGNORE INTO local_instance VALUES (1, ?)").run(randomBytes(32).toString("hex"));
  const { secret } = db.prepare("SELECT secret FROM local_instance WHERE slot=1").get();
  const now = Date.now();
  db.prepare("DELETE FROM local_sessions WHERE expiry<=?").run(now);
  db.prepare("DELETE FROM local_tickets WHERE expiry<=?").run(now);
  return {
    challenge(value) { return createHmac("sha256", secret).update("workspace:" + value).digest("hex"); },
    issueTicket() {
      const token = randomBytes(32).toString("hex");
      db.prepare("INSERT INTO local_tickets VALUES (?,?)").run(digest(token), Date.now() + 10 * 60_000);
      return token;
    },
    takeTicket(token) {
      if (!/^[a-f0-9]{64}$/.test(token)) return null;
      return db.prepare("DELETE FROM local_tickets WHERE digest=? AND expiry>? RETURNING expiry").get(digest(token), Date.now()) ? owner : null;
    },
    newSession(account) {
      const token = randomBytes(32).toString("hex");
      db.prepare("INSERT INTO local_sessions VALUES (?,?,?,?)").run(digest(token), account.id, account.email, Date.now() + 8 * 3600_000);
      return token;
    },
    identity(token) {
      if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
      return db.prepare("SELECT id,email FROM local_sessions WHERE digest=? AND expiry>?").get(digest(token), Date.now()) || null;
    },
    revoke(token) { if (token) db.prepare("DELETE FROM local_sessions WHERE digest=?").run(digest(token)); },
    async addAccount(id, email, password) {
      if (!/^[A-Za-z0-9_.-]{1,80}$/.test(id) || id === owner.id || !/^[^\s@]+@[^\s@]+$/.test(email)
        || email.toLowerCase() === owner.email || typeof password !== "string" || password.length < 12 || password.length > 512) {
        throw new Error("Използвай свободно потребителско име, валиден имейл и парола от 12 до 512 знака.");
      }
      const salt = randomBytes(16).toString("hex");
      const proof = await derive(password, salt, 64);
      db.prepare("INSERT INTO local_accounts VALUES (?,?,?,?)").run(id, email, salt, proof.toString("hex"));
    },
    async verifyAccount(id, password) {
      if (typeof id !== "string" || typeof password !== "string" || id.length > 80 || password.length > 512) return null;
      const account = db.prepare("SELECT * FROM local_accounts WHERE id=?").get(id);
      const proof = await derive(password, account?.salt || secret, 64);
      return account && timingSafeEqual(proof, Buffer.from(account.proof, "hex")) ? { id: account.id, email: account.email } : null;
    },
    close() { db.close(); },
  };
}

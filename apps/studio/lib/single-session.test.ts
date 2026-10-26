import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { staffAccounts, staffSessions, staffUsers, staffVerifications } from "@newspoint/db/schema";

const state = vi.hoisted(() => ({ db: null as ReturnType<typeof drizzle> | null }));
vi.mock("@newspoint/db", async () => ({ ...await vi.importActual<typeof import("@newspoint/db")>("@newspoint/db"), getDb: () => state.db }));
import { keepNewestStaffSession } from "./single-session";
import { getAuth } from "./auth";

let pg: PGlite;
let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
  pg = new PGlite();
  db = drizzle(pg, { schema: { staffUsers, staffSessions, staffAccounts, staffVerifications } });
  state.db = db;
  await pg.exec(`
    create table staff_users (id text primary key, name text not null, email text not null unique,
      email_verified boolean not null default false, image text, role text not null default 'editor',
      created_at timestamptz not null default now(), updated_at timestamptz not null default now());
    create table staff_sessions (id text primary key, expires_at timestamptz not null, token text not null unique,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      ip_address text, user_agent text, user_id text not null references staff_users(id));
    create table staff_accounts (id text primary key, account_id text not null, provider_id text not null,
      user_id text not null references staff_users(id), access_token text, refresh_token text, id_token text,
      access_token_expires_at timestamptz, refresh_token_expires_at timestamptz, scope text, password text,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now());
    create table staff_verifications (id text primary key, identifier text not null, value text not null,
      expires_at timestamptz not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
    insert into staff_users (id,name,email) values ('editor-a','Editor A','a@example.invalid'), ('editor-b','Editor B','b@example.invalid');
  `);
}, 20_000);
afterAll(async () => { await pg?.close(); });

const session = (id: string, userId: string, at: string) => ({
  id, userId, token: `token-${id}`, createdAt: new Date(at), updatedAt: new Date(at), expiresAt: new Date("2030-01-01"),
});

describe("one active Studio session per profile", () => {
  it("replaces older sessions of the same profile while preserving another profile", async () => {
    await db.insert(staffSessions).values([
      session("old-a", "editor-a", "2026-10-26T10:00:00Z"),
      session("new-a", "editor-a", "2026-10-26T10:01:00Z"),
      session("only-b", "editor-b", "2026-10-26T10:00:00Z"),
    ]);
    expect(await keepNewestStaffSession("editor-a", "new-a")).toBe(true);
    expect((await db.select({ id: staffSessions.id }).from(staffSessions)).map(row => row.id).sort()).toEqual(["new-a", "only-b"]);
  });

  it("does not let an older overlapping login revoke the newer one", async () => {
    await db.insert(staffSessions).values(session("latest-a", "editor-a", "2026-10-26T10:02:00Z"));
    expect(await keepNewestStaffSession("editor-a", "new-a")).toBe(false);
    expect((await db.select({ id: staffSessions.id }).from(staffSessions).where(eq(staffSessions.userId, "editor-a")))).toEqual([{ id: "latest-a" }]);
    expect(await keepNewestStaffSession("editor-a", "latest-a")).toBe(true);
  });

  it("revokes the first browser on a second real Better Auth sign-in", async () => {
    vi.stubEnv("STUDIO_SESSION_SECRET", "qa-session-secret-at-least-32-characters-long");
    vi.stubEnv("STUDIO_PUBLIC_URL", "http://localhost:3000/admin");
    const password = "QA-OnlyPassword42!";
    await db.insert(staffAccounts).values({ id: "credential-a", accountId: "editor-a", providerId: "credential", userId: "editor-a", password: await hashPassword(password) });
    const auth = getAuth();
    const signIn = () => auth.handler(new Request("http://localhost:3000/admin/api/auth/sign-in/email", {
      method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ email: "a@example.invalid", password }),
    }));
    const first = await signIn();
    const second = await signIn();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const cookie = (response: Response) => response.headers.getSetCookie().find(value => value.startsWith("np_studio.session_token="))?.split(";")[0];
    const firstCookie = cookie(first);
    const secondCookie = cookie(second);
    expect(firstCookie).toBeTruthy();
    expect(secondCookie).toBeTruthy();
    const getSession = async (value: string) => auth.handler(new Request("http://localhost:3000/admin/api/auth/get-session", { headers: { cookie: value } }));
    expect(await (await getSession(firstCookie!)).json()).toBeNull();
    expect((await (await getSession(secondCookie!)).json()).user.id).toBe("editor-a");
    expect((await db.select({ id: staffSessions.id }).from(staffSessions).where(eq(staffSessions.userId, "editor-a")))).toHaveLength(1);
    vi.unstubAllEnvs();
  }, 20_000);
});

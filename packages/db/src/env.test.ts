import { describe, expect, it } from "vitest";
import { describeConnection, readDatabaseEnv } from "./env";

const tx = "postgresql://postgres.ref:s3cret-pass@aws-0-eu-central-1.pooler.supabase.com:6543/postgres";
const session = "postgresql://postgres.ref:s3cret-pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres";

describe("readDatabaseEnv", () => {
  it("reads dev and test variables separately", () => {
    const source = { DATABASE_URL: tx, DATABASE_URL_SESSION: session, TEST_DATABASE_URL: session, TEST_DATABASE_URL_SESSION: tx };
    expect(readDatabaseEnv("dev", source).DATABASE_URL).toBe(tx);
    expect(readDatabaseEnv("test", source).DATABASE_URL).toBe(session);
  });

  it("names every missing variable without falling back to dev for test", () => {
    const source = { DATABASE_URL: tx, DATABASE_URL_SESSION: session };
    expect(() => readDatabaseEnv("test", source)).toThrow(/TEST_DATABASE_URL, TEST_DATABASE_URL_SESSION/);
  });

  it("rejects empty and non-postgres values", () => {
    expect(() => readDatabaseEnv("dev", { DATABASE_URL: "", DATABASE_URL_SESSION: "https://example.com" })).toThrow(
      /DATABASE_URL, DATABASE_URL_SESSION/,
    );
  });

  it("does not echo secrets in the error message", () => {
    expect(() => readDatabaseEnv("dev", { DATABASE_URL: tx, DATABASE_URL_SESSION: "mysql://u:s3cret-pass@h/db" })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("s3cret-pass") }),
    );
  });
});

describe("describeConnection", () => {
  it("omits the password", () => {
    const text = describeConnection(tx);
    expect(text).toContain("pooler.supabase.com:6543/postgres");
    expect(text).not.toContain("s3cret-pass");
  });
});

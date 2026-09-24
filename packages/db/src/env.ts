import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { config } from "dotenv";
import { z } from "zod";

const connectionUrl = z
  .string()
  .trim()
  .refine((value) => /^postgres(ql)?:\/\//.test(value), "must be a postgres:// connection string");

export const databaseEnvSchema = z.object({
  DATABASE_URL: connectionUrl,
  DATABASE_URL_SESSION: connectionUrl,
});

export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;

export type DatabaseTarget = "dev" | "test";

export function findRepoRoot(start: string = process.cwd()): string {
  let dir = resolve(start);
  while (!existsSync(resolve(dir, "pnpm-workspace.yaml"))) {
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error("pnpm-workspace.yaml not found above " + start);
    }
    dir = parent;
  }
  return dir;
}

export function loadRootEnv(): void {
  config({ path: resolve(findRepoRoot(), ".env.local"), quiet: true });
}

export function readDatabaseEnv(
  target: DatabaseTarget,
  source: Record<string, string | undefined> = process.env,
): DatabaseEnv {
  const prefix = target === "test" ? "TEST_" : "";
  const result = databaseEnvSchema.safeParse({
    DATABASE_URL: source[`${prefix}DATABASE_URL`],
    DATABASE_URL_SESSION: source[`${prefix}DATABASE_URL_SESSION`],
  });
  if (!result.success) {
    const missing = result.error.issues.map((issue) => `${prefix}${String(issue.path[0])}`);
    throw new Error(`Missing or invalid in .env.local: ${[...new Set(missing)].join(", ")}`);
  }
  return result.data;
}

export function describeConnection(url: string): string {
  const parsed = new URL(url);
  return `${parsed.hostname}:${parsed.port || "5432"}${parsed.pathname} (user ${decodeURIComponent(parsed.username)})`;
}

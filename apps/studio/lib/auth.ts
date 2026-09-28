import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { getDb, loadRootEnv, staffAccounts, staffRoles, staffSessions, staffUsers, staffVerifications } from "@newspoint/db";
import { LoginGuard } from "./login-guard";
import { sendPasswordResetEmail } from "./password-reset-mail";
import { PASSWORD_MAX, PASSWORD_MIN, passwordProblems } from "./password-policy";
import { BASE_PATH, normalizePasswordResetUrl, readStudioPublicBaseUrl, studioTrustedOrigins } from "./paths";

// DEC-110. No public sign-up: accounts are created by the master admin.
// Studio is reached through the public host at /admin, so its cookies carry
// the np_studio prefix and no Domain attribute.

function readSecret(): string {
  const secret = process.env.STUDIO_SESSION_SECRET ?? "";
  if (secret.length < 32) {
    throw new Error("STUDIO_SESSION_SECRET in .env.local must be at least 32 random characters");
  }
  return secret;
}

const globalForGuard = globalThis as typeof globalThis & { __npLoginGuard?: LoginGuard };
const guard = (globalForGuard.__npLoginGuard ??= new LoginGuard());

const SIGN_IN = "/sign-in/email";
const REQUEST_PASSWORD_RESET = "/request-password-reset";
const CHANGE_PASSWORD = "/change-password";

export function studioOrigins() {
  loadRootEnv();
  const publicBase = readStudioPublicBaseUrl();
  return { publicOrigin: new URL(publicBase).origin, trusted: studioTrustedOrigins() };
}

function createAuth() {
  const { publicOrigin, trusted } = studioOrigins();
  return betterAuth({
    appName: "NewsPoint Studio",
    baseURL: publicOrigin,
    basePath: `${BASE_PATH}/api/auth`,
    secret: readSecret(),
    trustedOrigins: trusted,
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: { user: staffUsers, session: staffSessions, account: staffAccounts, verification: staffVerifications },
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN,
      maxPasswordLength: PASSWORD_MAX,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        void sendPasswordResetEmail(user.email, normalizePasswordResetUrl(url));
      },
      onPasswordReset: async ({ user }) => {
        guard.recordSuccess(user.email);
      },
    },
    user: {
      additionalFields: {
        role: { type: [...staffRoles], required: true, defaultValue: "editor", input: false },
      },
    },
    session: { expiresIn: 60 * 60 * 12, updateAge: 60 * 60 },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 60,
      customRules: {
        [SIGN_IN]: { window: 60, max: 5 },
        [REQUEST_PASSWORD_RESET]: { window: 60, max: 5 },
        [CHANGE_PASSWORD]: { window: 60, max: 5 },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === CHANGE_PASSWORD) {
          const problems = passwordProblems(String(ctx.body?.newPassword ?? ""));
          if (problems.length) throw new APIError("BAD_REQUEST", { message: "Новата парола не отговаря на правилата." });
          return;
        }
        if (ctx.path !== SIGN_IN) return;
        const email = String(ctx.body?.email ?? "");
        const wait = guard.lockedFor(email);
        if (wait > 0) {
          throw new APIError("TOO_MANY_REQUESTS", { message: `locked:${Math.ceil(wait / 60_000)}` });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== SIGN_IN) return;
        const email = String(ctx.body?.email ?? "");
        if (ctx.context.newSession) guard.recordSuccess(email);
        else guard.recordFailure(email);
      }),
    },
    advanced: { cookiePrefix: "np_studio", skipTrailingSlashes: true },
    plugins: [nextCookies()],
  });
}

let instance: ReturnType<typeof createAuth> | undefined;
let authCacheKey = "";

/** Created on first use so that builds do not need database access or secrets. */
export function getAuth() {
  loadRootEnv();
  const cacheKey = `${readStudioPublicBaseUrl()}|${process.env.WEB_URL ?? ""}`;
  if (!instance || authCacheKey !== cacheKey) {
    instance = createAuth();
    authCacheKey = cacheKey;
  }
  return instance;
}

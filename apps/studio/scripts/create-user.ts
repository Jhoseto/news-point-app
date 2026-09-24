// Creates or updates a Studio account. There is no public sign-up (DEC-110).
// Mainly for the first master admin; after that accounts are managed in Studio.
//   pnpm studio:user --email koce@newspoint.bg --name "Коце" --role master_admin
//   pnpm studio:user --email ivan@newspoint.bg --role admin --update
// The password is typed without echo. STUDIO_USER_PASSWORD is read instead
// only for automated checks.
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "@newspoint/db/orm";
import { createScriptDb, staffAccounts, staffRoles, staffUsers, type StaffRole } from "@newspoint/db/node";
import { passwordProblems, PASSWORD_MIN } from "../lib/password-policy";

const { values: args } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    role: { type: "string" },
    update: { type: "boolean", default: false },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const email = args.email?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("--email is required");
const role = args.role as StaffRole | undefined;
if (role && !staffRoles.includes(role)) fail(`--role must be one of: ${staffRoles.join(", ")}`);

function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(prompt);
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          stdin.setRawMode?.(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u0003") process.exit(130);
        if (char === "\u0008" || char === "\u007f") value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on("data", onData);
  });
}

async function readPassword(): Promise<string> {
  const fromEnv = process.env.STUDIO_USER_PASSWORD;
  if (fromEnv) return fromEnv;
  const first = await readHidden(`Парола (поне ${PASSWORD_MIN} знака, голяма и малка буква, цифра и символ): `);
  const second = await readHidden("Повторете паролата: ");
  if (first !== second) fail("Паролите не съвпадат.");
  return first;
}

const { db, close } = createScriptDb("dev");
try {
  const [existing] = await db.select().from(staffUsers).where(eq(staffUsers.email, email)).limit(1);
  if (existing && !args.update) fail(`${email} already exists; add --update to change the role or password`);
  if (!existing && (!args.name?.trim() || !role)) fail("--name and --role are required for a new account");

  const password = await readPassword();
  const problems = passwordProblems(password);
  if (problems.length) fail(`Паролата не отговаря на правилата. Липсва: ${problems.join(", ")}.`);
  const hash = await hashPassword(password);

  await db.transaction(async (tx) => {
    if (existing) {
      await tx
        .update(staffUsers)
        .set({ ...(role ? { role } : {}), ...(args.name?.trim() ? { name: args.name.trim() } : {}), updatedAt: new Date() })
        .where(eq(staffUsers.id, existing.id));
      const updated = await tx
        .update(staffAccounts)
        .set({ password: hash, updatedAt: new Date() })
        .where(and(eq(staffAccounts.userId, existing.id), eq(staffAccounts.providerId, "credential")))
        .returning({ id: staffAccounts.id });
      if (!updated.length) {
        await tx.insert(staffAccounts).values({ id: randomUUID(), accountId: existing.id, providerId: "credential", userId: existing.id, password: hash });
      }
      return;
    }
    const id = randomUUID();
    await tx.insert(staffUsers).values({ id, name: args.name!.trim(), email, role: role!, emailVerified: true });
    await tx.insert(staffAccounts).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: hash });
  });
  console.log(existing ? `Updated ${email}.` : `Created ${email} (${role}).`);
} finally {
  await close();
}

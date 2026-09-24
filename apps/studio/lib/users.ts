import "server-only";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { asc, eq, sql } from "@newspoint/db/orm";
import { getDb, staffAccounts, staffSessions, staffUsers, type StaffRole } from "@newspoint/db";
import { EditorError } from "./articles";
import { assignableRoles, canChangeRole, canDeleteAccount, canManageAccounts, canManageRoles } from "./editor/roles";
import { PASSWORD_MAX, passwordProblems } from "./password-policy";
import type { Staff } from "./session";

export interface StaffListItem {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  createdAt: Date;
  lastActiveAt: Date | null;
}

const assignable = z.enum(["editor", "admin"]);

export const roleChangeInput = z.object({ role: assignable });

export const createUserInput = z.object({
  name: z.string().trim().min(2, "Името е твърде кратко.").max(80),
  email: z.email("Невалиден имейл.").trim().toLowerCase().max(254),
  role: assignable,
  password: z.string().max(PASSWORD_MAX),
});

export async function listStaff(): Promise<StaffListItem[]> {
  return getDb()
    .select({
      id: staffUsers.id,
      name: staffUsers.name,
      email: staffUsers.email,
      role: staffUsers.role,
      createdAt: staffUsers.createdAt,
      lastActiveAt: sql<Date | null>`(select max(s.updated_at) from ${staffSessions} s where s.user_id = ${staffUsers.id})`.mapWith(
        (value: string | null) => (value ? new Date(value) : null),
      ),
    })
    .from(staffUsers)
    .orderBy(asc(staffUsers.name));
}

async function findTarget(id: string) {
  const [target] = await getDb().select({ id: staffUsers.id, role: staffUsers.role }).from(staffUsers).where(eq(staffUsers.id, id)).limit(1);
  if (!target) throw new EditorError(404, "not_found", "Профилът не съществува.");
  return target;
}

export async function changeRole(actor: Staff, id: string, role: StaffRole): Promise<{ id: string; role: StaffRole }> {
  if (!canManageRoles(actor.role)) throw new EditorError(403, "forbidden", "Нямате право да сменяте роли.");
  const target = await findTarget(id);
  if (!canChangeRole(actor, target, role)) {
    throw new EditorError(403, "forbidden", actor.id === id ? "Не можете да смените собствената си роля." : "Нямате право за тази промяна.");
  }
  await getDb().update(staffUsers).set({ role, updatedAt: new Date() }).where(eq(staffUsers.id, id));
  return { id, role };
}

export async function createUser(actor: Staff, input: z.infer<typeof createUserInput>): Promise<{ id: string }> {
  if (!canManageAccounts(actor.role)) throw new EditorError(403, "forbidden", "Само мастър админ създава профили.");
  if (!assignableRoles(actor.role).includes(input.role)) throw new EditorError(403, "forbidden", "Нямате право да давате тази роля.");
  const problems = passwordProblems(input.password);
  if (problems.length) throw new EditorError(422, "weak_password", "Паролата не отговаря на правилата.", problems);

  const db = getDb();
  const [taken] = await db.select({ id: staffUsers.id }).from(staffUsers).where(eq(staffUsers.email, input.email)).limit(1);
  if (taken) throw new EditorError(409, "email_taken", "Вече има профил с този имейл.");

  const hash = await hashPassword(input.password);
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(staffUsers).values({ id, name: input.name, email: input.email, role: input.role, emailVerified: true });
    await tx.insert(staffAccounts).values({ id: crypto.randomUUID(), accountId: id, providerId: "credential", userId: id, password: hash });
  });
  return { id };
}

/** Sessions and credentials go with the account; articles and revisions keep their history. */
export async function deleteUser(actor: Staff, id: string): Promise<{ id: string }> {
  const target = await findTarget(id);
  if (!canDeleteAccount(actor, target)) {
    throw new EditorError(403, "forbidden", actor.id === id ? "Не можете да изтриете собствения си профил." : "Само мастър админ изтрива профили.");
  }
  await getDb().delete(staffUsers).where(eq(staffUsers.id, id));
  return { id };
}

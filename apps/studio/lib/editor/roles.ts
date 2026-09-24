import type { StaffRole } from "@newspoint/db/schema";

// Roles confirmed by Koce on 24.09.2026:
// - editor publishes news;
// - admin also moves people between editor and admin, but cannot create or delete accounts;
// - master_admin can do everything, including creating and deleting accounts.

export const ROLE_LABELS: Record<StaffRole, string> = {
  editor: "Редактор",
  admin: "Администратор",
  master_admin: "Мастър админ",
};

export function canManageRoles(role: StaffRole): boolean {
  return role === "admin" || role === "master_admin";
}

export function canManageAccounts(role: StaffRole): boolean {
  return role === "master_admin";
}

/** Roles the actor may hand out. Master admin is only granted from the command line. */
export function assignableRoles(role: StaffRole): StaffRole[] {
  return canManageRoles(role) ? ["editor", "admin"] : [];
}

interface Account {
  id: string;
  role: StaffRole;
}

export function canChangeRole(actor: Account, target: Account, next: StaffRole): boolean {
  if (actor.id === target.id) return false;
  if (!assignableRoles(actor.role).includes(next)) return false;
  if (target.role === "master_admin") return actor.role === "master_admin";
  return true;
}

export function canDeleteAccount(actor: Account, target: Account): boolean {
  return canManageAccounts(actor.role) && actor.id !== target.id;
}

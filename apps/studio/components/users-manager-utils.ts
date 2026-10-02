import type { StaffRole } from "@newspoint/db/schema";

export const ROLE_TONE: Record<StaffRole, "neutral" | "info" | "positive"> = {
  editor: "neutral",
  admin: "info",
  master_admin: "positive",
};

export const ROLE_KEYS: StaffRole[] = ["editor", "admin", "master_admin"];

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  createdAt: string;
  lastActiveAt: string | null;
  profileBio: string;
  profileImageUrl: string | null;
}

export function countUsers(users: UserRow[]): Record<string, number> {
  const counts: Record<string, number> = { all: users.length };
  for (const role of ROLE_KEYS) {
    counts[role] = 0;
  }
  for (const user of users) {
    counts[user.role] = (counts[user.role] ?? 0) + 1;
  }
  return counts;
}

export function filterUsers(users: UserRow[], filter: "all" | StaffRole, query: string): UserRow[] {
  const q = query.trim().toLowerCase();
  return users.filter((user) => {
    if (filter !== "all" && user.role !== filter) return false;
    if (q) {
      const text = `${user.name} ${user.email} ${user.profileBio}`.toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });
}

export const initialsFrom = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
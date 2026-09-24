import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UsersManager } from "@/components/users-manager";
import { canManageAccounts, canManageRoles } from "@/lib/editor/roles";
import { requireStaff } from "@/lib/session";
import { listStaff } from "@/lib/users";

export const metadata: Metadata = { title: "Профили" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const staff = await requireStaff();
  if (!canManageRoles(staff.role)) redirect("/");
  const users = await listStaff();
  return (
    <UsersManager
      actor={{ id: staff.id, role: staff.role }}
      canManageAccounts={canManageAccounts(staff.role)}
      users={users.map((user) => ({ ...user, createdAt: user.createdAt.toISOString(), lastActiveAt: user.lastActiveAt?.toISOString() ?? null }))}
    />
  );
}

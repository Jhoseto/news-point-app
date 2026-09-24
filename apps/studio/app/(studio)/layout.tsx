import type { ReactNode } from "react";
import { StudioShell } from "@/components/studio-shell";
import { canManageRoles, ROLE_LABELS } from "@/lib/editor/roles";
import { requireStaff } from "@/lib/session";

export default async function StudioLayout({ children }: { children: ReactNode }) {
  const staff = await requireStaff();
  return (
    <StudioShell
      user={{ name: staff.name, role: ROLE_LABELS[staff.role] }}
      webUrl={process.env.WEB_URL ?? "http://localhost:3000"}
      canManageUsers={canManageRoles(staff.role)}
    >
      {children}
    </StudioShell>
  );
}

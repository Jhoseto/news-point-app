import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { StaffRole } from "@newspoint/db/schema";
import { getAuth } from "./auth";

export interface Staff {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
}

async function sessionFrom(requestHeaders: Headers): Promise<Staff | null> {
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) return null;
  const { id, name, email, role } = session.user;
  if (!["editor", "admin", "master_admin"].includes(String(role))) return null;
  return { id, name, email, role: role as StaffRole };
}

/** Role comes from the database on every request, so a role change applies at once. */
export const getStaff = cache(async (): Promise<Staff | null> => sessionFrom(await headers()));

export async function requireStaff(): Promise<Staff> {
  const staff = await getStaff();
  if (!staff) redirect("/login/");
  return staff;
}

export function staffFromRequest(request: Request): Promise<Staff | null> {
  return sessionFrom(request.headers);
}

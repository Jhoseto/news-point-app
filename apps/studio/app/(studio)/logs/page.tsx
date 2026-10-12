import { notFound } from "next/navigation";
import { requireStaff } from "../../../lib/session";
import { canReadLogs } from "../../../lib/editor/roles";
import { LogsDesk } from "../../../components/logs-desk";

export const dynamic = "force-dynamic";
export default async function LogsPage() {
  const staff = await requireStaff();
  if (!canReadLogs(staff.role)) notFound();
  return <LogsDesk />;
}

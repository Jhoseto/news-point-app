import { notFound } from "next/navigation";
import { requireStaff } from "../../../lib/session";
import { canReadLogs } from "../../../lib/editor/roles";
import { ErrorMonitoringDesk } from "../../../components/error-monitoring-desk";

export const dynamic = "force-dynamic";
export default async function ErrorMonitoringPage() {
  const staff = await requireStaff();
  if (!canReadLogs(staff.role)) notFound();
  return <ErrorMonitoringDesk userKey={staff.id} />;
}

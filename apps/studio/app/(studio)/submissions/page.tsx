import type { Metadata } from "next";
import { SubmissionsManager } from "@/components/submissions-manager";
import { listSubmissions } from "@/lib/submissions";
import { requireStaff } from "@/lib/session";

export const metadata: Metadata = { title: "Сигнали" };
export const dynamic = "force-dynamic";

export default async function SubmissionsPage() {
  await requireStaff();
  const rows = await listSubmissions();
  return <SubmissionsManager initial={rows.map((row) => ({ ...row, payload: row.payload as Record<string, unknown>, createdAt: row.createdAt.toISOString() }))} />;
}

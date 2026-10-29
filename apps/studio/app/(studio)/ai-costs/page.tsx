import { notFound } from "next/navigation";
import { requireStaff } from "../../../lib/session";
import { canReadLogs } from "../../../lib/editor/roles";
import { AiCostsDesk } from "../../../components/ai-costs-desk";
export const dynamic="force-dynamic";
export default async function AiCostsPage(){const staff=await requireStaff();if(!canReadLogs(staff.role))notFound();return <AiCostsDesk/>;}

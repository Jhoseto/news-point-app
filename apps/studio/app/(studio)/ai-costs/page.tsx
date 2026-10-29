import {redirect} from "next/navigation";
import {requireStaff} from "../../../lib/session";
import {canReadLogs} from "../../../lib/editor/roles";
import {notFound} from "next/navigation";
export const dynamic="force-dynamic";
export default async function FormerAiCostsPage(){const staff=await requireStaff();if(!canReadLogs(staff.role))notFound();redirect("/ai-settings/");}

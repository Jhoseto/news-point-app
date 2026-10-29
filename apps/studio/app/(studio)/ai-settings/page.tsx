import {notFound} from "next/navigation";
import {requireStaff} from "../../../lib/session";
import {canReadLogs} from "../../../lib/editor/roles";
import {AiSettingsDesk} from "../../../components/ai-settings-desk";
export const dynamic="force-dynamic";
export default async function AiSettingsPage(){const staff=await requireStaff();if(!canReadLogs(staff.role))notFound();return <AiSettingsDesk/>;}

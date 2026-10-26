import { requireStaff } from "../../../lib/session";
import { CityDesk } from "../../../components/city-desk";
import { readCityManagement } from "@newspoint/db/city-admin";
import { readCityCollectorHealth } from "../../../lib/city-collector-health";
export const metadata = { title: "Моят Пловдив · NewsPoint Studio" };
export const dynamic = "force-dynamic";
export default async function CityPage() {
  await requireStaff();
  try {
    const [sources,collector]=await Promise.all([readCityManagement(),readCityCollectorHealth()]);
    return <CityDesk initial={{sources,collector,checkedAt:new Date().toISOString()}}/>;
  } catch { return <CityDesk/>; }
}

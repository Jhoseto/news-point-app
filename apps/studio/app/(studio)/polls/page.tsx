import { requireStaff } from "@/lib/session";
import { pollsReady, listPolls } from "@newspoint/db/polls";
import { PollManager } from "@/components/poll-manager";

export const metadata = {title:"Анкети"};
export const dynamic = "force-dynamic";
export default async function PollsPage() {
  const staff=await requireStaff();
  if(!await pollsReady()) return <section className="rounded-2xl border border-line bg-surface p-6"><h1 className="text-xl font-extrabold text-ink">Анкети</h1><p className="mt-3 text-sm">Панелът е готов за активиране. Приложете <strong>16_polls.sql</strong> в Supabase и презаредете страницата.</p><p className="mt-2 text-xs text-muted">Миграцията създава хранилището за анкети, защитените гласове и историята. Не добавя примерни резултати.</p></section>;
  return <PollManager initial={await listPolls()} canCorrect={staff.role === "admin" || staff.role === "master_admin"}/>;
}

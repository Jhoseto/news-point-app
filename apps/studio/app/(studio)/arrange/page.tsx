import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HOME_PAGE_KEY } from "@newspoint/content";
import { ArrangeDesk } from "@/components/arrange-desk";
import { loadArrangement } from "@/lib/arrangements";

export const metadata: Metadata = { title: "Подреждане" };
export const dynamic = "force-dynamic";

export default async function ArrangePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const requested = typeof params.page === "string" ? params.page : HOME_PAGE_KEY;
  try {
    const data = await loadArrangement(requested);
    return (
      <div>
        <h1 className="mb-2 text-base font-bold text-ink">Подреждане</h1>
        <ArrangeDesk
          pageKey={data.pageKey}
          menu={data.menu}
          draft={data.draft}
          note={data.note}
          articles={data.articles}
          history={data.history}
          ready={data.ready}
        />
      </div>
    );
  } catch {
    redirect("/arrange/");
  }
}

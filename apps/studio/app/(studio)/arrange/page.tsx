import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HOME_PAGE_KEY } from "@newspoint/content";
import { ArrangeDesk } from "@/components/arrange-desk";
import { loadArrangement } from "@/lib/arrangements";
import { getDb, readBreakingSettings } from "@newspoint/db";
import { BreakingControl } from "@/components/breaking-control";

export const metadata: Metadata = { title: "Уеб управление" };
export const dynamic = "force-dynamic";

export default async function ArrangePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const requested = typeof params.page === "string" ? params.page : HOME_PAGE_KEY;
  try {
    const [data, breaking] = await Promise.all([loadArrangement(requested), readBreakingSettings(getDb())]);
    return (
      <div>
        <h1 className="mb-2 text-base font-bold text-ink">Уеб управление</h1>
        <BreakingControl initial={breaking} />
        <ArrangeDesk
          key={`${data.pageKey}:${data.version}`}
          version={data.version}
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

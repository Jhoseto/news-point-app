import { Breadcrumbs } from "@/components/breadcrumbs";
import { JsonLd } from "@/components/json-ld";
import { breadcrumbList } from "@/lib/jsonld";
import { PUBLIC_SEO_PAGES, publicMetadata } from "@/lib/public-metadata";
import { shareOrigin } from "@/lib/share-card";
import { voteQuestions } from "../../../../polit-compass/data/bg-votes.mjs";

export const revalidate = 3600;
const { path, title } = PUBLIC_SEO_PAGES.compass;
const name = "Политически компас";
const description = `Отговори на ${voteQuestions.length} въпроса и сравни възгледите си с реални гласувания на партиите в Народното събрание. Безплатен тест без регистрация.`;
export const metadata = {
  ...publicMetadata({ path, title, description, imagePath: "/share/politicheski-kompas-v1.jpg",
    imageAlt: "Политически компас на NewsPoint.bg — Как би гласувал ти в Народното събрание?" }),
};

export default async function PoliticalCompassPage() {
  const { default: CompassApp } = await import("../../../../polit-compass/components/CompassApp");
  const origin = shareOrigin();
  const url = origin + path;
  return (
    <div className="np-container flex flex-col gap-4 pt-3 pb-10 lg:gap-8 lg:pt-5">
      <JsonLd id="np-compass-schema" data={[
        { "@type": "WebPage", "@id": url, url, name: title, description, inLanguage: "bg",
          isPartOf: { "@id": origin + "/#website" }, mainEntity: { "@id": url + "#app" } },
        { "@type": "WebApplication", "@id": url + "#app", url, name, description, inLanguage: "bg",
          isAccessibleForFree: true, operatingSystem: "Web", applicationCategory: "EducationalApplication",
          author: { "@id": origin + "/#organization" } },
        breadcrumbList(origin, [{ name: "Начало", path: "/" }, { name, path }]),
      ]} />
      <Breadcrumbs items={[{ name }]} />
      <CompassApp />
    </div>
  );
}

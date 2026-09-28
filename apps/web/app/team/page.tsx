import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SectionTitle } from "@/components/ui";
import { getPublicTeam } from "@/lib/queries";

export const revalidate = 60;
export const metadata: Metadata = {
  title: "Екип",
  description: "Хората зад NewsPoint.bg",
};

export default async function TeamPage() {
  const people = await getPublicTeam();
  return (
    <div className="np-container flex flex-col gap-8 pt-5 pb-12">
      <Breadcrumbs items={[{ name: "Екип" }]} />
      <header className="max-w-3xl">
        <SectionTitle as="h1">Екип</SectionTitle>
        <p className="text-base leading-relaxed text-body sm:text-lg">Хората, които подготвят и проверяват новините на NewsPoint.bg.</p>
      </header>
      {people.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {people.map((person) => (
            <li key={person.id} className="np-card flex min-h-40 flex-col gap-4 p-6">
              <div className="np-ring !size-9" aria-hidden="true" />
              <div>
                <h2 className="text-xl font-extrabold tracking-tight text-ink">{person.name}</h2>
                {person.bio ? <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-body">{person.bio}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="np-card max-w-3xl p-6 text-body">Представянето на екипа се подготвя. Новините и редакционният подпис остават достъпни на сайта.</p>
      )}
    </div>
  );
}

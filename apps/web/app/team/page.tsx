import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { JsonLd } from "@/components/json-ld";
import { person } from "@/lib/jsonld";
import { getPublicTeam } from "@/lib/queries";
import { shareOrigin } from "@/lib/share-card";
import "./team.css";

export const revalidate = 60;
export const metadata: Metadata = {
  title: "Екип",
  description: "Хората зад NewsPoint.bg",
};

type TeamPhoto = { small: string; large: string; alt: string };

const photos = {
  hero: { small: "/brand/team-office-1-800-f2f61151.webp", large: "/brand/team-office-1-1600-f2f61151.webp", alt: "Редакционна обстановка на NewsPoint.bg" },
  newsroom: { small: "/brand/team-office-4-800-a87b2eb8.webp", large: "/brand/team-office-4-1600-a87b2eb8.webp", alt: "Работни места в редакционна обстановка" },
  philosophy: { small: "/brand/team-office-2-800-36eeb7ba.webp", large: "/brand/team-office-2-1600-36eeb7ba.webp", alt: "Кът за разговори в редакционна обстановка" },
  podcast: { small: "/brand/team-office-5-800-c1b62cab.webp", large: "/brand/team-office-5-1600-c1b62cab.webp", alt: "Студио с микрофони за NewsPodcast" },
  contact: { small: "/brand/team-office-3-800-b06cdfef.webp", large: "/brand/team-office-3-1600-b06cdfef.webp", alt: "Микрофон в редакционна обстановка" },
} satisfies Record<string, TeamPhoto>;

const portraitByName: Record<string, TeamPhoto> = {
  "петър георгиев": { small: "/brand/team-petar-800-ec3c8032.webp", large: "/brand/team-petar-1600-ec3c8032.webp", alt: "Петър Георгиев" },
  "станимир дикелов": { small: "/brand/team-stanimir-800-a3a9da19.webp", large: "/brand/team-stanimir-1600-a3a9da19.webp", alt: "Станимир Дикелов" },
  "атанас доминов": { small: "/brand/team-atanas-800-79a10b0e.webp", large: "/brand/team-atanas-1600-79a10b0e.webp", alt: "Атанас Доминов" },
  "николай мутавски": { small: "/brand/team-nikolai-800-358ea9af.webp", large: "/brand/team-nikolai-1600-358ea9af.webp", alt: "Николай Мутавски" },
};

// These four names and portraits were supplied explicitly for the public team page.
// They are editorial content, separate from private Studio staff profiles.
const featuredPeople = [
  {
    id: "team-atanas", name: "Атанас Доминов", role: "Главен редактор",
    bio: "Ръководи редакционната политика и определя основните теми и приоритети на медията. Отговаря за журналистическите стандарти, достоверността на информацията и цялостното развитие на редакционното съдържание.", isPublic: true,
  },
  {
    id: "team-stanimir", name: "Станимир Дикелов", role: "Репортер",
    bio: "Работи там, където се случват новините. Следи актуалните събития, търси различните гледни точки и предава информацията от място бързо, точно и достъпно за читателите.", isPublic: true,
  },
  {
    id: "team-petar", name: "Петър Георгиев", role: "Редактор – разследващ журналист",
    bio: "Следи новините от Пловдив, страната и света и работи за тяхното точно и навременно представяне. Фокусът му е върху ясния новинарски текст, проверената информация и темите с обществено значение.", isPublic: true,
  },
  {
    id: "team-nikolai", name: "Николай Мутавски", role: "Разследващ журналист",
    bio: "Следи темите отвъд официалните версии и търси фактите зад събитията. Работи по разследвания, обществени казуси и истории, които изискват задълбочена проверка и журналистическа последователност.", isPublic: true,
  },
] as const;

function Photo({ photo, className = "", priority = false }: { photo: TeamPhoto; className?: string; priority?: boolean }) {
  return (
    <img
      className={className}
      src={photo.large}
      srcSet={`${photo.small} 800w, ${photo.large} 1600w`}
      sizes={className === "np-team-cover" ? "100vw" : "(max-width: 700px) 100vw, 50vw"}
      alt={photo.alt}
      width={1600}
      height={900}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
    />
  );
}

export default async function TeamPage() {
  const publicProfiles = await getPublicTeam();
  const featuredNames = new Set(featuredPeople.map((member) => member.name.toLocaleLowerCase("bg")));
  const ordered = [
    ...featuredPeople.filter((member) => member.isPublic),
    ...publicProfiles.filter((member) => !featuredNames.has(member.name.toLocaleLowerCase("bg"))).map((member) => ({ ...member, role: "" })),
  ];
  const origin = shareOrigin();
  const organizationId = `${origin}/#organization`;
  const peopleLd = ordered.map((member) => {
    const portrait = portraitByName[member.name.trim().toLocaleLowerCase("bg")];
    return person({
      origin,
      slug: member.id,
      name: member.name,
      jobTitle: member.role || undefined,
      bio: member.bio,
      imageUrl: portrait ? `${origin}${portrait.large}` : undefined,
      organizationId,
      publicProfile: true,
    });
  });

  return (
    <div className="np-team">
      <JsonLd data={peopleLd} id="np-ld-people" />
      <div className="np-team-crumb"><Breadcrumbs items={[{ name: "Екип" }]} /></div>

      <section className="np-team-hero" aria-labelledby="np-team-title">
        <Photo photo={photos.hero} className="np-team-cover" priority />
        <div className="np-team-hero-shade" aria-hidden="true" />
        <div className="np-team-hero-copy">
          <span className="np-team-eyebrow">Екип</span>
          <h1 id="np-team-title">Хората зад<br />NewsPoint.bg</h1>
          <p>Редакцията на NewsPoint.bg обединява млади и амбициозни журналисти, репортери и редактори с професионализъм, енергия и хъс за развитието на съвременната журналистика.</p>
          <span className="np-team-signature">Редакция <span aria-hidden="true">•</span> Пловдив</span>
        </div>
      </section>

      {ordered.length ? (
        <div className="np-team-members">
          {ordered.map((member, index) => {
            const portrait = portraitByName[member.name.trim().toLocaleLowerCase("bg")];
            return (
              <div key={member.id}>
                <section id={member.id} className={`np-team-member ${index % 2 === 0 ? "np-team-member-reverse" : ""} ${portrait ? "" : "np-team-member-no-photo"}`} aria-labelledby={`np-team-person-${index}`}>
                  {portrait ? <div className="np-team-member-image"><Photo photo={portrait} /></div> : null}
                  <div className="np-team-member-copy">
                    <div className="np-team-member-inner">
                      <h2 id={`np-team-person-${index}`}>{member.name}</h2>
                      {member.role ? <p className="np-team-role">{member.role}</p> : null}
                      {member.bio ? <p className="np-team-bio">{member.bio}</p> : <p className="np-team-bio">Част от редакцията на NewsPoint.bg.</p>}
                    </div>
                  </div>
                </section>
                {index === 1 ? <NewsroomBanner /> : null}
              </div>
            );
          })}
          {ordered.length < 2 ? <NewsroomBanner /> : null}
        </div>
      ) : (
        <div className="np-team-empty">Представянето на екипа се подготвя.</div>
      )}

      <section className="np-team-split" aria-labelledby="np-team-philosophy">
        <div className="np-team-split-image"><Photo photo={photos.philosophy} /></div>
        <div className="np-team-split-copy">
          <span className="np-team-eyebrow">Нашата философия</span>
          <h2 id="np-team-philosophy">Говорим с хората,<br />не само за тях.</h2>
          <p>Вярваме в силата на открития разговор, честната журналистика и в историите, които показват реалния живот. Слушаме, питаме, проверяваме и даваме глас на важните теми за обществото.</p>
        </div>
      </section>

      <section className="np-team-podcast" aria-labelledby="np-team-podcast-title">
        <Photo photo={photos.podcast} className="np-team-cover" />
        <div className="np-team-banner-shade" aria-hidden="true" />
        <div className="np-team-banner-copy">
          <span className="np-team-eyebrow">NewsPodcast</span>
          <h2 id="np-team-podcast-title">И когато историята<br />има нужда от повече време.</h2>
          <p>Разговори. Анализи. Истории отвъд заглавията.</p>
          <Link className="np-team-link" href="/livepoint/podcast/">Разгледай подкаста <span aria-hidden="true">→</span></Link>
        </div>
      </section>

      <section className="np-team-contact" aria-labelledby="np-team-contact-title">
        <Photo photo={photos.contact} className="np-team-cover" />
        <div className="np-team-banner-shade" aria-hidden="true" />
        <div className="np-team-contact-copy">
          <div>
            <span className="np-team-eyebrow">Имаш история?</span>
            <h2 id="np-team-contact-title">Разкажи ни.<br /><span>Защото истината има значение!</span></h2>
          </div>
          <div className="np-team-contact-action">
            <p>Ако си свидетел на събитие или имаш информация по важна тема, свържи се с нас. Всеки сигнал се разглежда от редакцията.</p>
            <Link className="np-team-link np-team-link-filled" href="/livepoint/report/">Подай сигнал <span aria-hidden="true">→</span></Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function NewsroomBanner() {
  return (
    <section className="np-team-newsroom" aria-labelledby="np-team-newsroom-title">
      <Photo photo={photos.newsroom} className="np-team-cover" />
      <div className="np-team-banner-shade" aria-hidden="true" />
      <div className="np-team-banner-copy">
        <span className="np-team-eyebrow">Редакцията</span>
        <h2 id="np-team-newsroom-title">NewsPoint не е просто сайт.<br />Това е редакция.</h2>
        <p>Нашият екип следи информационния поток денонощно, проверява фактите и отразява най-важните събития от Пловдив и региона, България и света.</p>
      </div>
    </section>
  );
}

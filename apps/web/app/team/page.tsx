import { publicPageMetadata } from "@/lib/public-metadata";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { JsonLd } from "@/components/json-ld";
import { person } from "@/lib/jsonld";
import { getPublicTeam } from "@/lib/queries";
import { featuredPeople } from "@/lib/public-team";
import { shareOrigin } from "@/lib/share-card";
import "./team.css";

export const revalidate = 60;
export const metadata = publicPageMetadata("team");

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
      <div className="np-team-crumb"><Breadcrumbs items={[{ name: "За нас" }]} /></div>

      <section className="np-team-hero" aria-labelledby="np-team-title">
        <Photo photo={photos.hero} className="np-team-cover" priority />
        <div className="np-team-hero-shade" aria-hidden="true" />
        <div className="np-team-hero-copy">
          <span className="np-team-eyebrow">За нас</span>
          <h1 id="np-team-title">Независима медия с национален обхват и силен регионален фокус</h1>
          <span className="np-team-signature">Редакция <span aria-hidden="true">•</span> Пловдив</span>
        </div>
      </section>

      <section className="np-team-about" aria-labelledby="np-team-mission">
        <div className="np-team-about-inner">
          <h2 id="np-team-mission" className="sr-only">За NewsPoint.bg</h2>
          <p>NewsPoint.bg е независим новинарски портал, който информира, анализира и разказва за най-важните събития от Пловдив, региона и страната. Медията стартира на 1 март 2023 година и се утвърждава като бързо развиваща се платформа за новини, анализи, коментари и актуални видеоматериали.</p>
          <p>Нашата мисия е да предоставяме точна, навременна и разбираема информация. Не се ограничаваме единствено до съобщаването на фактите, а търсим причините, последствията и различните гледни точки зад всяка значима тема.</p>
          <p>Следим политиката, работата на държавните и местните институции, обществения живот, бизнеса, икономиката, здравеопазването, образованието, инфраструктурата, сигурността, спорта, културата и светските събития. Срещаме читателите си както с представители на властта и бизнеса, така и с обикновени хора, чиито проблеми и истории заслужават обществено внимание.</p>
          <h3>Анализи и коментари</h3>
          <p>Анализите и коментарите са сред водещите направления на NewsPoint.bg. Разглеждаме важните обществени, политически, икономически и регионални теми в дълбочина, проверяваме обещанията на институциите и проследяваме последствията от техните решения.</p>
          <p>Показваме различните гледни точки, поставяме проблемите открито и търсим възможните решения. В коментарните материали ясно разграничаваме фактите от авторската позиция, като се стремим всяко мнение да бъде аргументирано и основано на проверена информация.</p>
          <p>Нашата цел е да развиваме интелигентна, обективна и отговорна журналистика, която не само информира, но и помага на читателите да разбират по-добре процесите около тях.</p>
          <h3 id="np-team-staff">Нашият екип</h3>
          <p>Зад NewsPoint.bg стои екип от журналисти, редактори, анализатори, фотографи, оператори и млади репортери. Работим ежедневно, за да бъдем близо до събитията и да предоставяме актуални новини, снимки и видеокадри от мястото, на което се случват важните неща.</p>
          <p>Нашите репортери и оператори са на разположение денонощно, за да отразяват извънредни ситуации, обществени проблеми и значими събития от Пловдив, региона и цялата страна.</p>
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

      <section className="np-team-about np-team-about-follow" aria-labelledby="np-team-principles">
        <div className="np-team-about-inner">
          <h2 id="np-team-principles">Нашите принципи</h2>
          <p>NewsPoint.bg е независима медия, лоялна към своите читатели и отговорна към хората, за които пише. Представяме фактите ясно, проверяваме информацията и даваме право на отговор на всички засегнати страни.</p>
          <p>Посочваме авторите и източниците на публикациите и снимките, когато това е приложимо. Разграничаваме новинарското съдържание от анализите, коментарите, рекламните и партньорските материали.</p>
          <p>Когато допуснем неточност, я коригираме своевременно и прозрачно. Не представяме слухове и непотвърдена информация като установени факти.</p>
          <h3>Всеки читател може да бъде наш репортер</h3>
          <p>Вярваме, че гражданската активност е важна част от съвременната журналистика. Всеки наш читател може да бъде и наш репортер, като изпрати сигнал, снимка или видеоклип за проблем, нередност или събитие от обществен интерес.</p>
          <p>Всеки получен сигнал се проверява от редакционния ни екип преди публикуване. Така заедно даваме гласност на важните теми и помагаме проблемите на хората да достигнат до отговорните институции.</p>
        </div>
      </section>

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

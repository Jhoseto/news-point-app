import { publicPageMetadata } from "@/lib/public-metadata";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { JsonLd } from "@/components/json-ld";
import { person } from "@/lib/jsonld";
import { getPublicTeam } from "@/lib/queries";
import { featuredPeople } from "@/lib/public-team";
import { MODULE_PATHS } from "@/lib/livepoint/config";
import { shareOrigin } from "@/lib/share-card";
import { TeamExperience } from "./team-experience";
import "../literata-bg.css";
import "./team.css";

export const revalidate = 60;
export const metadata = publicPageMetadata("team");

type TeamPhoto = { small: string; large: string; alt: string };

const portraitByName: Record<string, TeamPhoto> = {
  "петър георгиев": { small: "/brand/team-petar-cutout-800-bed7fe09.webp", large: "/brand/team-petar-cutout-1120-bed7fe09.webp", alt: "Петър Георгиев" },
  "станимир дикелов": { small: "/brand/team-stanimir-cutout-800-b23223c9.webp", large: "/brand/team-stanimir-cutout-1120-b23223c9.webp", alt: "Станимир Дикелов" },
  "атанас доминов": { small: "/brand/team-atanas-cutout-800-d3aa0ef8.webp", large: "/brand/team-atanas-cutout-1120-d3aa0ef8.webp", alt: "Атанас Доминов" },
  "николай мутавски": { small: "/brand/team-nikolai-cutout-800-018f69d2.webp", large: "/brand/team-nikolai-cutout-1120-018f69d2.webp", alt: "Николай Мутавски" },
  "вилина дишева": { small: "/brand/team-vilina-cutout-800-9e90f1a3.webp", large: "/brand/team-vilina-cutout-1120-9e90f1a3.webp", alt: "Вилина Дишева" },
  "мария пашова": { small: "/brand/team-maria-cutout-800-0681e8d8.webp", large: "/brand/team-maria-cutout-1120-0681e8d8.webp", alt: "Мария Пашова" },
};

function Photo({ photo, preview = false }: { photo: TeamPhoto; preview?: boolean }) {
  return (
    <img
      src={photo.large}
      srcSet={`${photo.small} 800w, ${photo.large} 1120w`}
      sizes={preview ? "(max-width: 700px) 30vw, 180px" : "(max-width: 560px) 90vw, (max-width: 1200px) 40vw, 22vw"}
      alt={preview ? "" : photo.alt}
      width={1120}
      height={1400}
      loading={preview ? "eager" : "lazy"}
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
    <TeamExperience>
      <JsonLd data={peopleLd} id="np-ld-people" />
      <div className="np-team-crumb"><Breadcrumbs items={[{ name: "За нас" }]} /></div>

      <section className="np-team-hero" aria-labelledby="np-team-title">
        <div className="np-team-hero-copy">
          <div className="np-team-kicker"><span className="np-team-eyebrow">За нас</span><span className="np-team-signature">Редакция <span aria-hidden="true">•</span> Пловдив</span></div>
          <h1 id="np-team-title"><span>Независима медия</span> с национален обхват и <em>силен регионален фокус</em></h1>
          <p className="np-team-hero-lead">NewsPoint.bg е независим новинарски портал, който информира, анализира и разказва за най-важните събития от Пловдив, региона и страната. Медията стартира на 1 март 2023 година и се утвърждава като бързо развиваща се платформа за новини, анализи, коментари и актуални видеоматериали.</p>
          <a className="np-team-text-link" href="#np-team-staff">Запознай се с екипа <span aria-hidden="true">↘</span></a>
        </div>
        <div className="np-team-collage" aria-label="Хората зад NewsPoint.bg">
          <span className="np-team-collage-caption">Хората зад новините</span>
          <div className="np-team-fan">
            {featuredPeople.map((member) => {
              const portrait = portraitByName[member.name.toLocaleLowerCase("bg")];
              return portrait ? (
              <a className="np-team-fan-card" href={"#" + member.id} key={member.id} aria-label={"Към представянето на " + member.name}>
                <div className="np-team-fan-photo"><Photo photo={portrait} preview /></div>
                <span>{member.name}</span>
              </a>
              ) : null;
            })}
          </div>
          <div className="np-team-collage-note"><span aria-hidden="true">↳</span><span>Говорим с хората,<br /><em>не само за тях.</em></span></div>
        </div>
      </section>

      <nav className="np-team-index" aria-label="В тази страница">
        <span className="np-team-index-label">Отвътре <span aria-hidden="true">↘</span></span>
        <a href="#np-team-mission">Медията</a><a href="#np-team-staff">Хората</a><a href="#np-team-principles">Принципите</a><a href="#np-team-reader">Твоят глас</a>
        <span className="np-team-reading-line" aria-hidden="true" />
      </nav>

      <section className="np-team-story np-team-section" id="np-team-mission" data-team-chapter aria-labelledby="np-team-mission-title">
        <div className="np-team-section-heading" data-team-reveal><span className="np-team-eyebrow">Близо до събитията</span><h2 id="np-team-mission-title">За NewsPoint.bg</h2></div>
        <div className="np-team-story-grid">
          <div className="np-team-mission-note" data-team-reveal><span className="np-team-margin-note" aria-hidden="true">Смисълът.</span><p>Нашата мисия е да предоставяме точна, навременна и разбираема информация. Не се ограничаваме единствено до съобщаването на фактите, а търсим причините, последствията и различните гледни точки зад всяка значима тема.</p><svg className="np-team-ink-line" viewBox="0 0 260 20" fill="none" aria-hidden="true"><path d="M3 13C70 1 171 2 255 8M42 17C94 11 162 11 215 12" /></svg></div>
          <div className="np-team-story-copy" data-team-reveal><p>Следим политиката, работата на държавните и местните институции, обществения живот, бизнеса, икономиката, здравеопазването, образованието, инфраструктурата, сигурността, спорта, културата и светските събития. Срещаме читателите си както с представители на властта и бизнеса, така и с обикновени хора, чиито проблеми и истории заслужават обществено внимание.</p></div>
        </div>
      </section>

      <section className="np-team-analysis np-team-section" aria-labelledby="np-team-analysis-title">
        <div className="np-team-analysis-copy" data-team-reveal><span className="np-team-eyebrow">Отвъд заглавията</span><h2 id="np-team-analysis-title">Анализи <em>и коментари</em></h2><p>Анализите и коментарите са сред водещите направления на NewsPoint.bg. Разглеждаме важните обществени, политически, икономически и регионални теми в дълбочина, проверяваме обещанията на институциите и проследяваме последствията от техните решения. Не се пестим в изразяването на критични погледи и коментари, и винаги се стремим да покажем по-голям обхват на темите, които ние разглеждаме.</p><p>
          Показваме различните гледни точки, поставяме проблемите открито и търсим възможните решения. В коментарните материали ясно разграничаваме фактите от авторската позиция, като се стремим всяко мнение да бъде аргументирано и основано на проверена информация.</p></div>
        <blockquote className="np-team-editorial-note" data-team-reveal><span className="np-team-note-label">Нашата цел</span><p>Нашата цел е да развиваме интелигентна, обективна и отговорна журналистика, която не само информира, но и помага на читателите да разбират по-добре процесите около тях.</p><span className="np-team-note-signature" aria-hidden="true">NewsPoint.bg <span>↗</span></span></blockquote>
      </section>

      <section className="np-team-staff np-team-section" id="np-team-staff" data-team-chapter aria-labelledby="np-team-staff-title">
        <div className="np-team-staff-heading" data-team-reveal><div><span className="np-team-eyebrow">Лицата. Гласовете. Характерът.</span><h2 id="np-team-staff-title">Нашият <em>екип</em><span className="np-team-heading-dot" aria-hidden="true">.</span></h2></div><span className="np-team-staff-handnote" aria-hidden="true">Приятно ни е! <span>↙</span></span></div>
        <div className="np-team-staff-intro" data-team-reveal><p>Зад NewsPoint.bg стои екип от журналисти, редактори, анализатори, фотографи, оператори и млади репортери. Работим ежедневно, за да бъдем близо до събитията и да предоставяме актуални новини, снимки и видеокадри от мястото, на което се случват важните неща.</p><p>Нашите репортери и оператори са на разположение денонощно, за да отразяват извънредни ситуации, обществени проблеми и значими събития от Пловдив, региона и цялата страна.</p></div>
        <div className="np-team-members">
          {ordered.map((member, index) => {
            const portrait = portraitByName[member.name.trim().toLocaleLowerCase("bg")];
            return (
              <article key={member.id} id={member.id} className={"np-team-member " + (portrait ? "" : "np-team-member-no-photo")} aria-labelledby={"np-team-person-" + index} data-team-reveal>
                {portrait ? <div className="np-team-member-image"><Photo photo={portrait} /></div> : null}
                <div className="np-team-member-copy"><h3 id={"np-team-person-" + index}>{member.name}</h3>{member.role ? <p className="np-team-role">{member.role}</p> : null}</div>
                {member.bio ? <p className="np-team-bio">{member.bio}</p> : <p className="np-team-bio">Част от редакцията на NewsPoint.bg.</p>}
              </article>
            );
          })}
        </div>
      </section>

      <section className="np-team-newsroom" aria-labelledby="np-team-newsroom-title" data-team-reveal>
        <div><span className="np-team-eyebrow">Редакцията</span><h2 id="np-team-newsroom-title">NewsPoint не е просто сайт.<br /><em>Това е редакция.</em></h2></div>
        <div><p>Нашият екип следи информационния поток денонощно, проверява фактите и отразява най-важните събития от Пловдив и региона, България и света.</p></div><span className="np-team-cross" aria-hidden="true">✳</span>
      </section>

      <section className="np-team-principles np-team-section" id="np-team-principles" data-team-chapter aria-labelledby="np-team-principles-title">
        <div className="np-team-section-heading" data-team-reveal><span className="np-team-eyebrow">Доверието има основа</span><h2 id="np-team-principles-title">Нашите <em>принципи</em></h2></div>
        <div className="np-team-principle-grid">
          <article data-team-reveal><span className="np-team-principle-mark" aria-hidden="true">↗</span><h3>Независимост</h3><p>NewsPoint.bg е независима медия, лоялна към своите читатели и отговорна към хората, за които пише. Представяме фактите ясно, проверяваме информацията и даваме право на отговор на всички засегнати страни.</p></article>
          <article data-team-reveal><span className="np-team-principle-mark" aria-hidden="true">≋</span><h3>Прозрачност</h3><p>Посочваме авторите и източниците на публикациите и снимките, когато това е приложимо. Разграничаваме новинарското съдържание от анализите, коментарите, рекламните и партньорските материали.</p></article>
          <article data-team-reveal><span className="np-team-principle-mark" aria-hidden="true">↺</span><h3>Отговорност</h3><p>Когато допуснем неточност, я коригираме своевременно и прозрачно. Не представяме слухове и непотвърдена информация като установени факти.</p></article>
        </div>
      </section>

      <div className="np-team-conversations np-team-section">
        <section className="np-team-philosophy" aria-labelledby="np-team-philosophy-title" data-team-reveal><span className="np-team-eyebrow">Нашата философия</span><h2 id="np-team-philosophy-title">Говорим с хората,<br /><em>не само за тях.</em></h2><p>Вярваме в силата на открития разговор, честната журналистика и в историите, които показват реалния живот. Слушаме, питаме, проверяваме и даваме глас на важните теми за обществото.</p><span className="np-team-quote-mark" aria-hidden="true">“</span></section>
        <section className="np-team-podcast" aria-labelledby="np-team-podcast-title" data-team-reveal><div className="np-team-podcast-top"><span className="np-team-eyebrow">Podcast</span><div className="np-team-wave" aria-hidden="true">{Array.from({ length: 17 }, (_, i) => <i key={i} />)}</div></div><h2 id="np-team-podcast-title">И когато историята<br /><em>има нужда от повече време.</em></h2><p>Разговори. Анализи. Истории отвъд заглавията.</p><Link className="np-team-link" href="/livepoint/podcast/">Разгледай подкаста <span aria-hidden="true">→</span></Link></section>
      </div>

      <section className="np-team-reader np-team-section" id="np-team-reader" data-team-chapter aria-labelledby="np-team-reader-title">
        <div className="np-team-reader-copy" data-team-reveal><span className="np-team-eyebrow">От другата страна си ти</span><h2 id="np-team-reader-title">Всеки читател може да бъде <em>наш репортер</em></h2><p>Вярваме, че гражданската активност е важна част от съвременната журналистика. Всеки наш читател може да бъде и наш репортер, като изпрати сигнал, снимка или видеоклип за проблем, нередност или събитие от обществен интерес.</p><p>Всеки получен сигнал се проверява от редакционния ни екип преди публикуване. Така заедно даваме гласност на важните теми и помагаме проблемите на хората да достигнат до отговорните институции.</p></div>
        <div className="np-team-contact" data-team-reveal><span className="np-team-eyebrow">Имаш история?</span><h2>Разкажи ни.<br /><span>Защото истината има значение!</span></h2><p>Ако си свидетел на събитие или имаш информация по важна тема, свържи се с нас. Всеки сигнал се разглежда от редакцията.</p><Link className="np-team-link np-team-link-filled" href={MODULE_PATHS["my-news"]}>Твоята новина тук <span aria-hidden="true">↗</span></Link><span className="np-team-contact-doodle" aria-hidden="true">↗</span></div>
      </section>
    </TeamExperience>
  );
}

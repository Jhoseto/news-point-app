import type { Metadata } from "next";
import { absoluteMedia, shareOrigin } from "./share-card";
import { LEGAL_PATHS, legalReviewPending } from "./legal/types";

export const PUBLIC_SEO_PAGES = {
  home: { path: "/", title: "NewsPoint.bg – Гласът на истината", description: "Новини от Пловдив, България и света." },
  themes: { path: "/temi/", title: "Теми с продължение", description: "Редактирани хронологии от обединени новини по тема — от NewsPoint.bg." },
  podcast: { path: "/livepoint/podcast/", title: "Podcast · LivePoint", description: "Подкасти на NewsPoint за слушане." },
  weather: { path: "/livepoint/weather/", title: "Време · LivePoint", description: "Прогноза за Пловдив." },
  traffic: { path: "/livepoint/traffic/", title: "Трафик · LivePoint", description: "Карта и инциденти за Пловдив." },
  cameras: { path: "/livepoint/cameras/", title: "Камери · LivePoint", description: "Проверен каталог на публични камери около Пловдив." },
  report: { path: "/livepoint/report/", title: "Подай сигнал · LivePoint", description: "Сигнал към редакцията на NewsPoint." },
  myNews: { path: "/livepoint/my-news/", title: "Моята новина · LivePoint", description: "Изпратете авторски материал към редакцията." },
  team: { path: "/team/", title: "За нас", description: "NewsPoint.bg е независим новинарски портал за Пловдив, региона и страната.", image: "/brand/team-office-1-1600-f2f61151.webp" },
  contacts: { path: "/contacts/", title: "Контакти", description: "Свържете се с редакцията на NewsPoint.bg — телефон и имейл." },
  advertising: { path: "/advertising/", title: "Реклама", description: "Контакт за рекламни запитвания към NewsPoint.bg." },
  terms: { path: LEGAL_PATHS.terms, title: "Общи условия и правила за ползване", description: "Издател, авторски права и правила за изпращане и използване на материали в NewsPoint.bg." },
  personalData: { path: LEGAL_PATHS.personalData, title: "Политика за личните данни", description: "Обработване на лични данни, срокове, получатели и права на посетителите на NewsPoint.bg." },
  cookies: { path: LEGAL_PATHS.cookies, title: "Политика за бисквитките и сходните технологии", description: "Бисквитки, локални записи, цели, срокове и избор на посетителите на NewsPoint.bg." },
} as const;

/** Register review pages for metadata/share cards, but don't submit unfinished policies for indexing. */
export function discoverablePublicPages() {
  const reviewPaths = new Set<string>(legalReviewPending() ? Object.values(LEGAL_PATHS) : []);
  return Object.values(PUBLIC_SEO_PAGES).filter(page => !reviewPaths.has(page.path));
}

/** Every public page owns its OG object: Next replaces nested metadata rather than merging it. */
export function publicMetadata(input: { path: string; title: string; description: string; imagePath: string; type?: "website" | "article"; publishedTime?: string; modifiedTime?: string }): Metadata {
  const origin = shareOrigin();
  const url = `${origin}${input.path}`;
  const image = absoluteMedia(input.imagePath, origin);
  const description = input.description.trim() || input.title;
  return {
    title: input.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: input.title, description, url, siteName: "NewsPoint.bg", locale: "bg_BG",
      type: input.type ?? "website",
      ...(input.type === "article" ? { publishedTime: input.publishedTime, modifiedTime: input.modifiedTime } : {}),
      images: [{ url: image, width: 1200, height: 630, alt: input.title }],
    },
    twitter: { card: "summary_large_image", title: input.title, description, images: [image] },
  };
}

export function publicPageMetadata(key: keyof typeof PUBLIC_SEO_PAGES): Metadata {
  const metadata = publicMetadata({ ...PUBLIC_SEO_PAGES[key], imagePath: `/share/page/${key}/` });
  // The homepage already contains the brand; do not append it a second time.
  return key === "home" ? { ...metadata, title: { absolute: PUBLIC_SEO_PAGES.home.title } } : metadata;
}

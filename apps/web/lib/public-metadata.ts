import type { Metadata } from "next";
import { absoluteMedia, shareOrigin } from "./share-card";

export const PUBLIC_SEO_PAGES = {
  home: { path: "/", title: "NewsPoint.bg – Гласът на истината", description: "Новини от Пловдив, България и света." },
  themes: { path: "/temi/", title: "Теми с продължение", description: "Редактирани хронологии от обединени новини по тема — от NewsPoint.bg." },
  podcast: { path: "/livepoint/podcast/", title: "NewsPodcast · LivePoint", description: "Подкасти на NewsPoint за слушане." },
  weather: { path: "/livepoint/weather/", title: "Време · LivePoint", description: "Прогноза за Пловдив." },
  traffic: { path: "/livepoint/traffic/", title: "Трафик · LivePoint", description: "Карта и инциденти за Пловдив." },
  cameras: { path: "/livepoint/cameras/", title: "Камери · LivePoint", description: "Проверен каталог на публични камери около Пловдив." },
  report: { path: "/livepoint/report/", title: "Подай сигнал · LivePoint", description: "Сигнал към редакцията на NewsPoint." },
  myNews: { path: "/livepoint/my-news/", title: "Моята новина · LivePoint", description: "Изпратете авторски материал към редакцията." },
  team: { path: "/team/", title: "За нас", description: "NewsPoint.bg е независим новинарски портал за Пловдив, региона и страната.", image: "/brand/team-office-1-1600-f2f61151.webp" },
  contacts: { path: "/contacts/", title: "Контакти", description: "Свържете се с редакцията на NewsPoint.bg — адрес, телефон и имейл." },
  advertising: { path: "/advertising/", title: "Реклама", description: "Контакт за рекламни запитвания към NewsPoint.bg." },
} as const;

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

import { MODULE_LABELS, MODULE_PATHS } from "@/lib/livepoint/config";
import { PUBLIC_INFO_PAGES } from "@/lib/public-contact";

export const FOOTER_NAV_LINKS = [
  { name: "За нас", path: "/team/" },
  { name: "Podcast", path: "/livepoint/podcast/" },
  { name: PUBLIC_INFO_PAGES.contacts.title, path: PUBLIC_INFO_PAGES.contacts.path },
  { name: MODULE_LABELS["my-news"], path: MODULE_PATHS["my-news"] },
  { name: MODULE_LABELS.report, path: MODULE_PATHS.report },
  { name: "Настройки", path: "/settings/" },
] as const;

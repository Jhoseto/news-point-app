import type { MetadataRoute } from "next";

/**
 * Читателски PWA — отделен от редакционния. Не споделя manifest с apps/studio.
 * Стартовата снимка е статична (iPhone OS не анимира), анимацията с пръстените
 * се изпълнява в самия първи кадър на приложението, не в системната снимка.
 *
 * Иконите са базирани на /brand/newspoint-logo.webp. За iOS се ползва apple-touch-icon.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NewsPoint.bg – Гласът на истината",
    /** Launcher label under the home-screen icon (keep short so it is not truncated). */
    short_name: "NewsPoint",
    description: "Новини от Пловдив, България и света.",
    lang: "bg",
    dir: "ltr",
    start_url: "/",
    id: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    categories: ["news", "magazines"],
    icons: [
      {
        src: "/brand/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

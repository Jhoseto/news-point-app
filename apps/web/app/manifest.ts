import type { MetadataRoute } from "next";

/**
 * Читателски PWA — отделен от редакционния. Не споделя manifest с apps/studio.
 * Системният стартов кадър е статичен. След него приложението показва
 * същото оригинално лого на бяло с три секунди движение.
 *
 * Иконите използват логото, предоставено от Koce. За iOS се ползва apple-touch-icon.
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
        src: "/brand/icon-192.png?v=7",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/icon-512.png?v=7",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/icon-maskable-512.png?v=7",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

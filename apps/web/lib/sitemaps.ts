import "server-only";
import { unstable_cache } from "next/cache";
import * as data from "./sitemap-data";

export const SITEMAP_CACHE_TAG = "public-sitemaps";
const options = { revalidate: 3600, tags: [SITEMAP_CACHE_TAG] };
export const sitemapCounts = unstable_cache(data.sitemapCounts, ["sitemap-counts"], options);
export const sitemapPages = unstable_cache(data.sitemapPages, ["sitemap-pages"], options);
export const sitemapEntries = unstable_cache(data.sitemapEntries, ["sitemap-entries"], options);

// Mirrors packages/db/migrations/*.sql, which Koce applies manually (DEC-112).
// Keep in sync by hand; `pnpm db:verify` compares columns with the database.
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  wpId: integer("wp_id").unique(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  path: text("path").notNull().unique(),
  kind: text("kind", { enum: ["section", "label"] }).notNull().default("section"),
  inMenu: boolean("in_menu").notNull().default(false),
  menuOrder: integer("menu_order"),
  ...timestamps,
});

export const mediaAssets = pgTable("media_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider", { enum: ["wordpress_origin", "object_storage"] }).notNull(),
  sourceUrl: text("source_url"),
  storageKey: text("storage_key"),
  width: integer("width"),
  height: integer("height"),
  mime: text("mime"),
  alt: text("alt").notNull().default(""),
  caption: text("caption").notNull().default(""),
  credit: text("credit").notNull().default(""),
  wpId: integer("wp_id").unique(),
  ...timestamps,
});

export const articles = pgTable(
  "articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceSystem: text("source_system", { enum: ["wordpress", "studio"] }).notNull(),
    legacyId: bigint("legacy_id", { mode: "number" }),
    slug: text("slug").notNull(),
    path: text("path").notNull().unique(),
    sourceUrl: text("source_url"),
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull().default(""),
    authorName: text("author_name").notNull().default("NewsPoint.bg"),
    heroMediaId: uuid("hero_media_id").references(() => mediaAssets.id, { onDelete: "set null" }),
    primaryCategoryId: uuid("primary_category_id").references(() => categories.id, { onDelete: "set null" }),
    body: jsonb("body").notNull().default(sql`'[]'::jsonb`),
    bodyVersion: smallint("body_version").notNull().default(1),
    sourceHtml: text("source_html"),
    isPublic: boolean("is_public").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    sourceModifiedAt: timestamp("source_modified_at", { withTimezone: true }),
    importedAt: timestamp("imported_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique("articles_source_legacy_key").on(table.sourceSystem, table.legacyId),
    index("articles_public_published_idx").on(table.publishedAt.desc()).where(sql`${table.isPublic}`),
  ],
);

export const articleCategories = pgTable(
  "article_categories",
  {
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.articleId, table.categoryId] }),
    index("article_categories_category_idx").on(table.categoryId, table.articleId),
  ],
);

export const schemaTables = { categories, mediaAssets, articles, articleCategories };

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
  real,
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

/** Optional media presentation extension (migration 12); original locations stay intact. */
export const mediaPresentations = pgTable("media_presentations", {
  mediaAssetId: uuid("media_asset_id").primaryKey().references(() => mediaAssets.id, { onDelete: "cascade" }),
  variants: jsonb("variants").$type<{ url: string; width: number; height: number }[]>().notNull().default(sql`'[]'::jsonb`),
  focalX: real("focal_x"),
  focalY: real("focal_y"),
  ...timestamps,
});

// Better Auth core tables (DEC-110, migration 07). Property names are the ones
// Better Auth expects; the adapter maps them through this schema.
// Confirmed by Koce on 24.09.2026 (migration 08).
export const staffRoles = ["editor", "admin", "master_admin"] as const;
export type StaffRole = (typeof staffRoles)[number];

export const staffUsers = pgTable("staff_users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: text("role", { enum: staffRoles }).notNull().default("editor"),
  ...timestamps,
});

/** Public presentation data only; authentication fields stay in staff_users. */
export const authorProfiles = pgTable("author_profiles", {
  staffUserId: text("staff_user_id")
    .primaryKey()
    .references(() => staffUsers.id, { onDelete: "cascade" }),
  slug: text("slug").notNull().unique(),
  bio: text("bio").notNull().default(""),
  avatarMediaId: uuid("avatar_media_id").references(() => mediaAssets.id, { onDelete: "set null" }),
  isPublic: boolean("is_public").notNull().default(false),
  ...timestamps,
});

export const staffSessions = pgTable(
  "staff_sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ...timestamps,
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "cascade" }),
  },
  (table) => [index("staff_sessions_user_idx").on(table.userId)],
);

export const staffAccounts = pgTable(
  "staff_accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (table) => [index("staff_accounts_user_idx").on(table.userId)],
);

export const staffVerifications = pgTable(
  "staff_verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [index("staff_verifications_identifier_idx").on(table.identifier)],
);

export const articleAuthorKinds = ["staff", "newsroom", "manual"] as const;
export type ArticleAuthorKind = (typeof articleAuthorKinds)[number];

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
    authorKind: text("author_kind", { enum: articleAuthorKinds }).notNull().default("newsroom"),
    authorUserId: text("author_user_id").references(() => staffUsers.id, { onDelete: "set null" }),
    heroMediaId: uuid("hero_media_id").references(() => mediaAssets.id, { onDelete: "set null" }),
    primaryCategoryId: uuid("primary_category_id").references(() => categories.id, { onDelete: "set null" }),
    body: jsonb("body").notNull().default(sql`'[]'::jsonb`),
    bodyVersion: smallint("body_version").notNull().default(1),
    sourceHtml: text("source_html"),
    isPublic: boolean("is_public").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    sourceModifiedAt: timestamp("source_modified_at", { withTimezone: true }),
    importedAt: timestamp("imported_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    publishedRevision: integer("published_revision"),
    createdBy: text("created_by").references(() => staffUsers.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    unique("articles_source_legacy_key").on(table.sourceSystem, table.legacyId),
    index("articles_public_published_idx").on(table.publishedAt.desc()).where(sql`${table.isPublic}`),
  ],
);

/** Aggregate public reads. No reader identifiers or browsing history are stored. */
export const articleReadCounts = pgTable("article_read_counts", {
  articleId: uuid("article_id")
    .primaryKey()
    .references(() => articles.id, { onDelete: "cascade" }),
  readCount: bigint("read_count", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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

export const outboxEventTypes = ["article.published", "article.updated"] as const;
export type OutboxEventType = (typeof outboxEventTypes)[number];

export interface OutboxPayload {
  path: string;
  title: string;
  topics: string[];
}

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    type: text("type", { enum: outboxEventTypes }).notNull(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    payload: jsonb("payload").$type<OutboxPayload>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("outbox_events_entity_idx").on(table.entityId, table.id.desc())],
);

export const OUTBOX_CHANNEL = "np_outbox";

export const articleRevisions = pgTable(
  "article_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    excerpt: text("excerpt").notNull().default(""),
    body: jsonb("body").notNull(),
    primaryCategoryId: uuid("primary_category_id").references(() => categories.id, { onDelete: "set null" }),
    heroMediaId: uuid("hero_media_id").references(() => mediaAssets.id, { onDelete: "set null" }),
    authorKind: text("author_kind", { enum: articleAuthorKinds }).notNull().default("newsroom"),
    authorUserId: text("author_user_id").references(() => staffUsers.id, { onDelete: "set null" }),
    authorName: text("author_name").notNull().default("NewsPoint.bg"),
    createdBy: text("created_by").references(() => staffUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("article_revisions_article_id_number_key").on(table.articleId, table.number)],
);

export const publishRequests = pgTable("publish_requests", {
  idempotencyKey: uuid("idempotency_key").primaryKey(),
  articleId: uuid("article_id")
    .notNull()
    .references(() => articles.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull(),
  requestedBy: text("requested_by").references(() => staffUsers.id, { onDelete: "set null" }),
  outcome: jsonb("outcome").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const livepointSubmissionKinds = ["report", "my_news"] as const;
export type LivepointSubmissionKind = (typeof livepointSubmissionKinds)[number];

export const livepointSubmissionStatuses = ["received", "in_review", "verified", "rejected", "published"] as const;
export type LivepointSubmissionStatus = (typeof livepointSubmissionStatuses)[number];

/** Citizen signals and story tips (LivePoint). Public only after editorial approval. */
export const livepointSubmissions = pgTable(
  "livepoint_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind", { enum: livepointSubmissionKinds }).notNull(),
    status: text("status", { enum: livepointSubmissionStatuses }).notNull().default("received"),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    contact: text("contact"),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    articleId: uuid("article_id").references(() => articles.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [index("livepoint_submissions_kind_status_idx").on(table.kind, table.status, table.createdAt.desc())],
);

export const polls = pgTable("polls", {
  id: uuid("id").primaryKey().defaultRandom(),
  question: text("question").notNull(), description: text("description").notNull().default(""),
  options: jsonb("options").$type<{id:string;label:string}[]>().notNull(),
  status: text("status").notNull().default("draft"), featured: boolean("featured").notNull().default(false),
  startsAt: timestamp("starts_at",{withTimezone:true}), endsAt: timestamp("ends_at",{withTimezone:true}),
  adjustments: jsonb("adjustments").$type<Record<string,number>>().notNull().default({}),
  version: integer("version").notNull().default(1), createdAt: timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
});
export const pollVotes = pgTable("poll_votes", {
  id: bigint("id",{mode:"number"}).primaryKey().generatedAlwaysAsIdentity(),
  pollId: uuid("poll_id").notNull().references(()=>polls.id), optionId: uuid("option_id").notNull(),
  visitorHash: text("visitor_hash").notNull(), ipHash: text("ip_hash").notNull(),
  createdAt: timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[unique().on(t.pollId,t.visitorHash),index("poll_votes_ip").on(t.pollId,t.ipHash),index("poll_votes_option").on(t.pollId,t.optionId)]);
export const pollRevisions = pgTable("poll_revisions", {
  id: bigint("id",{mode:"number"}).primaryKey().generatedAlwaysAsIdentity(),pollId: uuid("poll_id").notNull().references(()=>polls.id),
  actorId: text("actor_id").notNull(),actorName: text("actor_name").notNull(),reason:text("reason").notNull(),
  snapshot:jsonb("snapshot").notNull(),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
});

export const schemaTables = {
  polls, pollVotes, pollRevisions,
  categories,
  mediaAssets,
  mediaPresentations,
  staffUsers,
  authorProfiles,
  staffSessions,
  staffAccounts,
  staffVerifications,
  articles,
  articleCategories,
  outboxEvents,
  articleRevisions,
  publishRequests,
  livepointSubmissions,
};

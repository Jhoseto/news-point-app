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
  numeric,
  customType,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/** Server-authenticated employee activity; identity snapshots survive account deletion. */
export const studioAuditLogs = pgTable("studio_audit_logs", {
  id: uuid("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  actorId: text("actor_id"),
  actorName: text("actor_name").notNull().default(""),
  actorEmail: text("actor_email").notNull().default(""),
  actorRole: text("actor_role", { enum: ["editor", "admin", "master_admin"] }),
  area: text("area").notNull(), action: text("action").notNull(), actionLabel: text("action_label").notNull(),
  entityKind: text("entity_kind").notNull().default(""), entityId: text("entity_id").notNull().default(""), entityLabel: text("entity_label").notNull().default(""),
  targetPath: text("target_path"),
  outcome: text("outcome", { enum: ["pending", "success", "failure", "access"] }).notNull(),
  method: text("method").notNull(), path: text("path").notNull(),
  statusCode: integer("status_code"), durationMs: integer("duration_ms"),
  ip: text("ip").notNull().default(""), userAgent: text("user_agent").notNull().default(""),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  searchText: text("search_text").notNull(),
}, (table) => [
  index("studio_audit_time_idx").on(table.startedAt.desc(), table.id),
  index("studio_audit_actor_time_idx").on(table.actorId, table.startedAt.desc()),
  index("studio_audit_area_time_idx").on(table.area, table.startedAt.desc()),
  index("studio_audit_action_time_idx").on(table.action, table.startedAt.desc()),
  index("studio_audit_outcome_time_idx").on(table.outcome, table.startedAt.desc()),
  index("studio_audit_entity_idx").on(table.entityKind, table.entityId, table.startedAt.desc()),
  index("studio_audit_search_idx").using("gin", table.searchText.op("gin_trgm_ops")),
]);

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
    heroEmbedUrl: text("hero_embed_url"),
    primaryCategoryId: uuid("primary_category_id").references(() => categories.id, { onDelete: "set null" }),
    body: jsonb("body").notNull().default(sql`'[]'::jsonb`),
    bodyVersion: smallint("body_version").notNull().default(1),
    sourceHtml: text("source_html"),
    isPublic: boolean("is_public").notNull().default(false),
    listenEnabled: boolean("listen_enabled").notNull().default(true),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    scheduledPublishAt: timestamp("scheduled_publish_at", { withTimezone: true }),
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
    // Migration 49 builds this native full-content index CONCURRENTLY.
    index("articles_smart_public_fulltext_idx").using("gin",sql`to_tsvector('simple',coalesce(${table.title},'')||' '||coalesce(${table.excerpt},'')||' '||${table.body}::text)`).where(sql`${table.isPublic}`),
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

/** Editorial additions on top of real reads. The public site shows the sum. */
export const articleViewBoosts = pgTable("article_view_boosts", {
  articleId: uuid("article_id")
    .primaryKey()
    .references(() => articles.id, { onDelete: "cascade" }),
  seedCount: bigint("seed_count", { mode: "number" }).notNull().default(0),
  artificialCount: bigint("artificial_count", { mode: "number" }).notNull().default(0),
  intervalSeconds: integer("interval_seconds"),
  targetCount: bigint("target_count", { mode: "number" }),
  seededAt: timestamp("seeded_at", { withTimezone: true }),
  nextIncrementAt: timestamp("next_increment_at", { withTimezone: true }),
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

export const outboxEventTypes = ["article.published", "article.updated", "layout.updated", "story.published", "story.updated", "breaking.updated"] as const;
export type OutboxEventType = (typeof outboxEventTypes)[number];

export interface OutboxPayload {
  path: string;
  title: string;
  topics: string[];
  visibilityChange?: { visible: boolean; actorId: string | null; actorName: string | null };
}

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    type: text("type", { enum: outboxEventTypes }).notNull(),
    entityId: uuid("entity_id").references(() => articles.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    payload: jsonb("payload").$type<OutboxPayload>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("outbox_events_entity_idx").on(table.entityId, table.id.desc())],
);

export const OUTBOX_CHANNEL = "np_outbox";

/** Append-only editorial breaking-message versions; latest id is the current state. */
export const breakingBulletins = pgTable("breaking_bulletins", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  enabled: boolean("enabled").notNull().default(false),
  text: text("text").notNull().default(""),
  articleId: uuid("article_id").references(() => articles.id, { onDelete: "set null" }),
  actorId: text("actor_id").references(() => staffUsers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("breaking_bulletins_article_idx").on(table.articleId), index("breaking_bulletins_actor_idx").on(table.actorId)]);

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
    heroEmbedUrl: text("hero_embed_url"),
    authorKind: text("author_kind", { enum: articleAuthorKinds }).notNull().default("newsroom"),
    authorUserId: text("author_user_id").references(() => staffUsers.id, { onDelete: "set null" }),
    authorName: text("author_name").notNull().default("NewsPoint.bg"),
    createdBy: text("created_by").references(() => staffUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** NULL = older revision; keep the article's existing listening policy. */
    listenEnabled: boolean("listen_enabled"),
  },
  (table) => [unique("article_revisions_article_id_number_key").on(table.articleId, table.number)],
);

/** Explicit QA article IDs — excludes reader push without suppressing publications. */
export const editorQaArticles = pgTable("editor_qa_articles", {
  articleId: uuid("article_id")
    .primaryKey()
    .references(() => articles.id, { onDelete: "cascade" }),
  runId: text("run_id").notNull(),
  registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
});

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

export const articleRevisionSocial = pgTable("article_revision_social", {
  articleId: uuid("article_id").notNull(), revision: integer("revision").notNull(),
  provider: text("provider").notNull().default("facebook"), enabled: boolean("enabled").notNull().default(false),
  text: text("text").notNull().default(""), textMode: text("text_mode", { enum: ["auto", "custom"] }).notNull(),
}, t => [primaryKey({ columns: [t.articleId, t.revision, t.provider] })]);
export const socialConnections = pgTable("social_connections", {
  provider: text("provider").primaryKey(), pageId: text("page_id").notNull(), name: text("name").notNull(),
  encryptedToken: text("encrypted_token").notNull(), metaUserId: text("meta_user_id"), status: text("status").notNull(),
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
  connectedBy: text("connected_by").references(() => staffUsers.id, { onDelete: "set null" }),
  generation: integer("generation").notNull().default(1), checkedAt: timestamp("checked_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const socialPublications = pgTable("social_publications", {
  id: uuid("id").primaryKey().defaultRandom(), articleId: uuid("article_id").references(() => articles.id, { onDelete: "set null" }),
  revision: integer("revision").notNull(), provider: text("provider").notNull().default("facebook"), pageId: text("page_id").notNull(),
  text: text("text").notNull(), articleUrl: text("article_url").notNull(), mediaId: uuid("media_id"), storageKey: text("storage_key"),
  status: text("status").notNull().default("pending"), step: text("step").notNull().default("prepare"),
  photoId: text("photo_id"), postId: text("post_id"), commentId: text("comment_id"), permalink: text("permalink"),
  preparedFile: text("prepared_file"), preparedHash: text("prepared_hash"), attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  leaseToken: uuid("lease_token"), leaseUntil: timestamp("lease_until", { withTimezone: true }),
  operationStartedAt: timestamp("operation_started_at", { withTimezone: true }), errorCode: text("error_code"), traceId: text("trace_id"),
  history: jsonb("history").$type<{ at: string; status: string; step: string; code?: string }[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [unique().on(t.articleId, t.provider, t.pageId), index("social_publications_due").on(t.status, t.nextAttemptAt)]);
export const socialOauthStates = pgTable("social_oauth_states", {
  id: text("id").primaryKey(), actorId: text("actor_id").notNull().references(() => staffUsers.id, { onDelete: "cascade" }),
  redirectUri: text("redirect_uri").notNull(), phase: text("phase").notNull(), encryptedPages: text("encrypted_pages"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const socialDeletionReceipts = pgTable("social_deletion_receipts", {
  id: uuid("id").primaryKey(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const livepointSubmissionKinds = ["report", "my_news"] as const;

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

export const pageArrangementStatuses = ["draft", "published", "history"] as const;

/** Editorial story placement for the existing homepage and category grids. */
export const pageArrangements = pgTable(
  "page_arrangements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageKey: text("page_key").notNull(),
    status: text("status", { enum: pageArrangementStatuses }).notNull(),
    document: jsonb("document").notNull(),
    note: text("note").notNull().default(""),
    placedBy: text("placed_by").references(() => staffUsers.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("page_arrangements_page_idx").on(table.pageKey, table.createdAt.desc())],
);

/**
 * Editor-curated "Теми с продължение". A story theme groups already-published
 * articles into a navigable timeline. The public reader sees the theme at
 * `/temi/[slug]/` and can browse all included articles. Articles are not
 * duplicated — the theme simply re-orders existing entries.
 */
export const storyThemes = pgTable(
  "story_themes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    intro: text("intro").notNull().default(""),
    coverMediaId: uuid("cover_media_id").references(() => mediaAssets.id, { onDelete: "set null" }),
    coverCaption: text("cover_caption").notNull().default(""),
    isPublished: boolean("is_published").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => staffUsers.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    index("story_themes_published_slug_key")
      .on(table.slug)
      .where(sql`is_published`),
    index("story_themes_published_idx")
      .on(table.publishedAt.desc())
      .where(sql`is_published`),
  ],
);

/** Many-to-many: which articles belong to a story theme and in what order. */
export const storyThemeArticles = pgTable(
  "story_theme_articles",
  {
    themeId: uuid("theme_id").notNull().references(() => storyThemes.id, { onDelete: "cascade" }),
    articleId: uuid("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
    addedBy: text("added_by").references(() => staffUsers.id, { onDelete: "set null" }),
  },
  (table) => [
    primaryKey({ columns: [table.themeId, table.articleId] }),
    index("story_theme_articles_theme_position_idx").on(table.themeId, table.position),
    index("story_theme_articles_article_idx").on(table.articleId),
  ],
);

/** Reader PWA Web Push subscriptions. One row per browser/device endpoint. */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    categorySlug: text("category_slug"),
    categorySlugs: jsonb("category_slugs").$type<string[] | null>(),
    revision: integer("revision").notNull().default(1),
    enabledAt: timestamp("enabled_at", { withTimezone: true }).defaultNow(),
    locale: text("locale").notNull().default("bg"),
    userAgent: text("user_agent").notNull().default(""),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
  },
  (table) => [
    index("push_subscriptions_enabled_idx").on(table.enabled),
    index("push_subscriptions_category_idx").on(table.categorySlug),
  ],
);

export const pushJobs = pgTable("push_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: bigint("event_id", { mode: "number" }).unique(),
  articleId: uuid("article_id").references(() => articles.id, { onDelete: "cascade" }),
  subscriptionId: uuid("subscription_id").references(() => pushSubscriptions.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["article", "test"] }).notNull(),
  status: text("status", { enum: ["pending", "expanded", "skipped"] }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull().default(sql`now() + interval '1 hour'`),
});

export const pushDeliveries = pgTable("push_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").notNull().references(() => pushJobs.id, { onDelete: "cascade" }),
  subscriptionId: uuid("subscription_id").notNull().references(() => pushSubscriptions.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["pending", "sending", "accepted", "failed", "skipped"] }).notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull().defaultNow(),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  leaseToken: uuid("lease_token"),
  lastStatus: integer("last_status"),
  errorCode: text("error_code"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
}, (table) => [unique("push_deliveries_job_subscription_key").on(table.jobId, table.subscriptionId)]);

export const pushRateLimits = pgTable("push_rate_limits", {
  bucket: text("bucket").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
  hits: integer("hits").notNull().default(1),
});

export const podcastStatuses = ["draft", "published"] as const;

/** One Podcast episode. Drafts stay off the public site. */
export const podcasts = pgTable(
  "podcasts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    summary: text("summary").notNull(),
    revision: integer("revision").notNull().default(1),
    coverKey: text("cover_key").notNull(),
    audioKey: text("audio_key").notNull(),
    durationSec: integer("duration_sec").notNull(),
    bytes: integer("bytes").notNull(),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    status: text("status", { enum: podcastStatuses }).notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => staffUsers.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [unique("podcasts_slug_key").on(table.slug), index("podcasts_public_idx").on(table.publishedAt.desc())],
);

/** Podcast snapshots reuse the existing Facebook queue without changing article rows. */
export const podcastSocialPublications = pgTable("podcast_social_publications", {
  jobId: uuid("job_id").primaryKey().references(() => socialPublications.id, { onDelete: "cascade" }),
  podcastId: uuid("podcast_id").references(() => podcasts.id, { onDelete: "set null" }),
  pageId: text("page_id").notNull(),
  title: text("title").notNull(),
}, table => [unique("podcast_social_publications_episode_page_key").on(table.podcastId, table.pageId)]);

/** Private resumable upload intent, durable across Studio/worker restarts. */
export const mediaUploadSessions = pgTable("media_upload_sessions", {
  id: uuid("id").primaryKey(), ownerId: text("owner_id").references(() => staffUsers.id, { onDelete: "set null" }),
  kind: text("kind", { enum: ["video", "podcast"] }).notNull(),
  state: text("state", { enum: ["uploading", "queued", "processing", "ready", "failed", "cancelled", "expired"] }).notNull().default("uploading"),
  manifest: jsonb("manifest").$type<Array<{ key: "video" | "audio" | "cover"; name: string; bytes: number; type: string; sha256: string }>>().notNull(),
  metadata: jsonb("metadata").$type<{ id?: string; revision?: number; title?: string; summary?: string; categoryId?: string | null; publish?: boolean }>().notNull(),
  reservedBytes: bigint("reserved_bytes", { mode: "number" }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  leaseToken: uuid("lease_token"), leaseUntil: timestamp("lease_until", { withTimezone: true }),
  artifacts: jsonb("artifacts").$type<Array<{ key: string; leaseToken: string }>>().notNull().default([]), cleanedAt: timestamp("cleaned_at", { withTimezone: true }), attempts: integer("attempts").notNull().default(0), result: jsonb("result").$type<Record<string, unknown>>(), error: text("error"),
  ...timestamps,
}, table => [index("media_upload_owner_idx").on(table.ownerId, table.state), index("media_upload_queue_idx").on(table.state, table.createdAt)]);
export const mediaUploadChunks = pgTable("media_upload_chunks", {
  sessionId: uuid("session_id").notNull().references(() => mediaUploadSessions.id, { onDelete: "cascade" }),
  fileKey: text("file_key").notNull(), chunkIndex: integer("chunk_index").notNull(), bytes: integer("bytes").notNull(), sha256: text("sha256").notNull(),
}, table => [primaryKey({ columns: [table.sessionId, table.fileKey, table.chunkIndex] })]);

/** AI Studio keeps source and script snapshots independent of public episodes. */
export const aiPodcastProjects = pgTable("ai_podcast_projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  settings: jsonb("settings").notNull(),
  sources: jsonb("sources").notNull(),
  factPacks: jsonb("fact_packs").notNull().default(sql`'{}'::jsonb`),
  segments: jsonb("segments").notNull().default(sql`'[]'::jsonb`),
  title: text("title"),
  summary: text("summary"),
  warnings: jsonb("warnings").notNull().default(sql`'[]'::jsonb`),
  status: text("status", { enum: ["new", "scripting", "review", "producing", "ready", "failed"] }).notNull().default("new"),
  revision: integer("revision").notNull().default(1),
  coverKey: text("cover_key"),
  musicAssetId: uuid("music_asset_id"),
  episodeId: uuid("episode_id").references(() => podcasts.id, { onDelete: "set null" }),
  createdBy: text("created_by").references(() => staffUsers.id, { onDelete: "set null" }),
  ...timestamps,
});

export const aiPodcastAssets = pgTable("ai_podcast_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind", { enum: ["music", "cover"] }).notNull(),
  preset: text("preset", { enum: ["daily", "evening", "breaking"] }),
  status: text("status", { enum: ["candidate", "approved"] }).notNull().default("candidate"),
  storageKey: text("storage_key").notNull(),
  prompt: text("prompt").notNull(),
  model: text("model").notNull(),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  createdBy: text("created_by").references(() => staffUsers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiPodcastJobs = pgTable("ai_podcast_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => aiPodcastProjects.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["script", "check", "produce", "segment", "music", "cover"] }).notNull(),
  payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
  status: text("status", { enum: ["queued", "running", "succeeded", "failed", "cancelled"] }).notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  error: text("error"),
  usage: jsonb("usage").notNull().default(sql`'{}'::jsonb`),
  requestedBy: text("requested_by").references(() => staffUsers.id, { onDelete: "set null" }),
  ...timestamps,
});

export const aiPodcastAudit = pgTable("ai_podcast_audit", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  projectId: uuid("project_id").notNull().references(() => aiPodcastProjects.id, { onDelete: "cascade" }),
  actorId: text("actor_id").references(() => staffUsers.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  details: jsonb("details").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiPodcastVoiceSettings = pgTable("ai_podcast_voice_settings", {
  id: boolean("id").primaryKey().default(true),
  alexVoice: text("alex_voice").notNull(),
  mayaVoice: text("maya_voice").notNull(),
  approvedBy: text("approved_by").references(() => staffUsers.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const storyThemeSlugs = pgTable("story_theme_slugs", {
  slug: text("slug").primaryKey(),
  themeId: uuid("theme_id").notNull().references(() => storyThemes.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("story_theme_slugs_theme_idx").on(table.themeId)]);

/** City-guide collection stays hidden until each source passes its review gate. */
export const citySources = pgTable("city_sources", {
  id: text("id").primaryKey(),
  category: text("category").notNull(),
  sourceUrl: text("source_url").notNull(),
  format: text("format").notNull(),
  refreshSeconds: integer("refresh_seconds").notNull().default(86400),
  reviewState: text("review_state", { enum: ["candidate", "pilot", "accepted", "rejected"] }).notNull().default("pilot"),
  publicationState: text("publication_state", { enum: ["hidden", "visible"] }).notNull().default("hidden"),
  lastCheckAt: timestamp("last_check_at", { withTimezone: true }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  ...timestamps,
});

export const citySourceChecks = pgTable("city_source_checks", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  sourceId: text("source_id").notNull().references(() => citySources.id, { onDelete: "restrict" }),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
  outcome: text("outcome", { enum: ["parsed", "unchanged", "unavailable"] }).notNull(),
  httpStatus: smallint("http_status"),
  itemCount: integer("item_count").notNull().default(0),
  addedCount: integer("added_count").notNull().default(0),
  changedCount: integer("changed_count").notNull().default(0),
  missingCount: integer("missing_count").notNull().default(0),
  detail: text("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("city_source_checks_recent_idx").on(table.sourceId, table.checkedAt)]);

export const cityRecords = pgTable("city_records", {
  sourceId: text("source_id").notNull().references(() => citySources.id, { onDelete: "restrict" }),
  recordKey: text("record_key").notNull(),
  fields: jsonb("fields").notNull(),
  fingerprint: text("fingerprint").notNull(),
  state: text("state", { enum: ["current", "missing"] }).notNull().default("current"),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  missingSince: timestamp("missing_since", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.sourceId, table.recordKey] }), index("city_records_current_idx").on(table.sourceId, table.lastSeenAt)]);

export const cityRecordVersions = pgTable("city_record_versions", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  sourceId: text("source_id").notNull(),
  recordKey: text("record_key").notNull(),
  fingerprint: text("fingerprint").notNull(),
  fields: jsonb("fields").notNull(),
  changeKind: text("change_kind", { enum: ["first", "changed", "missing", "returned"] }).notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
});

// Smart / AI accounting mirrors migrations 44–45. These are additive and default-off.
export const aiOperations=pgTable("ai_operations",{
  id:uuid("id").primaryKey(),module:text("module").notNull(),provider:text("provider").notNull(),projectId:text("project_id"),
  articleId:uuid("article_id").references(()=>articles.id,{onDelete:"set null"}),articleSnapshot:jsonb("article_snapshot").notNull().default({}),
  operation:text("operation").notNull(),model:text("model").notNull(),environment:text("environment").notNull(),status:text("status").notNull(),
  responseId:text("response_id").unique(),requestId:text("request_id"),usage:jsonb("usage"),rate:jsonb("rate"),amountUsd:numeric("amount_usd",{precision:30,scale:12}),errorCode:text("error_code"),
  startedAt:timestamp("started_at",{withTimezone:true}).notNull().defaultNow(),finishedAt:timestamp("finished_at",{withTimezone:true}),
});
export const aiProviderCosts=pgTable("ai_provider_costs",{
  provider:text("provider").notNull(),projectId:text("project_id").notNull(),bucketStart:timestamp("bucket_start",{withTimezone:true}).notNull(),bucketEnd:timestamp("bucket_end",{withTimezone:true}).notNull(),
  lineItem:text("line_item").notNull(),currency:text("currency").notNull(),amount:numeric("amount",{precision:30,scale:12}).notNull(),checkedAt:timestamp("checked_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[primaryKey({columns:[t.provider,t.projectId,t.bucketStart,t.lineItem,t.currency]})]);
export const smartSessions=pgTable("smart_sessions",{
  id:uuid("id").primaryKey(),articleId:uuid("article_id").notNull().references(()=>articles.id,{onDelete:"cascade"}),ownerHash:text("owner_hash").notNull(),revision:text("revision").notNull(),
  used:integer("used").notNull().default(0),deletedAt:timestamp("deleted_at",{withTimezone:true}),expiresAt:timestamp("expires_at",{withTimezone:true}).notNull(),...timestamps,
});
export const smartNodes=pgTable("smart_nodes",{
  key:text("key").primaryKey(),articleId:uuid("article_id").notNull().references(()=>articles.id,{onDelete:"cascade"}),revision:text("revision").notNull(),parentKey:text("parent_key"),
  questionId:text("question_id").notNull(),question:text("question").notNull(),answer:jsonb("answer"),state:text("state").notNull(),leaseToken:uuid("lease_token"),leaseUntil:timestamp("lease_until",{withTimezone:true}),
  expiresAt:timestamp("expires_at",{withTimezone:true}),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
});
export const smartDependencies=pgTable("smart_dependencies",{
  nodeKey:text("node_key").notNull().references(()=>smartNodes.key,{onDelete:"cascade"}),articleId:uuid("article_id").notNull().references(()=>articles.id,{onDelete:"cascade"}),revision:text("revision").notNull(),
},t=>[primaryKey({columns:[t.nodeKey,t.articleId]})]);
export const smartTurns=pgTable("smart_turns",{
  id:uuid("id").primaryKey(),sessionId:uuid("session_id").notNull().references(()=>smartSessions.id,{onDelete:"cascade"}),requestKey:uuid("request_key").notNull(),inputHash:text("input_hash").notNull(),
  question:text("question").notNull(),questionId:text("question_id"),parentKey:text("parent_key"),nodeKey:text("node_key").references(()=>smartNodes.key,{onDelete:"set null"}),status:text("status").notNull(),
  answer:jsonb("answer"),cached:boolean("cached").notNull().default(false),counted:boolean("counted").notNull().default(false),processorToken:uuid("processor_token"),errorCode:text("error_code"),
  leaseUntil:timestamp("lease_until",{withTimezone:true}).notNull(),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
});
export const smartBootstraps=pgTable("smart_bootstraps",{
  articleId:uuid("article_id").primaryKey().references(()=>articles.id,{onDelete:"cascade"}),revision:text("revision").notNull(),payload:jsonb("payload"),sources:jsonb("sources").notNull().default([]),
  state:text("state").notNull(),leaseToken:uuid("lease_token"),leaseUntil:timestamp("lease_until",{withTimezone:true}),expiresAt:timestamp("expires_at",{withTimezone:true}),updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow(),
});
export const smartFeedback=pgTable("smart_feedback",{
  sessionId:uuid("session_id").notNull().references(()=>smartSessions.id,{onDelete:"cascade"}),turnId:uuid("turn_id").notNull().references(()=>smartTurns.id,{onDelete:"cascade"}),useful:boolean("useful").notNull(),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[primaryKey({columns:[t.sessionId,t.turnId]})]);
export const smartActivity=pgTable("smart_activity",{
  turnId:uuid("turn_id").primaryKey(),articleId:uuid("article_id").references(()=>articles.id,{onDelete:"set null"}),articleSnapshot:jsonb("article_snapshot").notNull(),cached:boolean("cached").notNull(),environment:text("environment").notNull(),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
});
export const smartRateWindows=pgTable("smart_rate_windows",{key:text("key").notNull(),bucket:timestamp("bucket",{withTimezone:true}).notNull(),count:integer("count").notNull().default(1)},t=>[primaryKey({columns:[t.key,t.bucket]})]);
const smartVectorBytes=customType<{data:Buffer;driverData:Buffer}>({dataType:()=>"bytea"});
export const smartDocuments=pgTable("smart_documents",{
  articleId:uuid("article_id").notNull().references(()=>articles.id,{onDelete:"cascade"}),revision:text("revision").notNull(),chunk:integer("chunk").notNull(),text:text("text").notNull(),embedding:smartVectorBytes("embedding").notNull(),model:text("model").notNull().default("text-embedding-3-small"),indexedAt:timestamp("indexed_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[primaryKey({columns:[t.articleId,t.chunk]})]);
export const smartIndexJobs=pgTable("smart_index_jobs",{
  articleId:uuid("article_id").primaryKey().references(()=>articles.id,{onDelete:"cascade"}),revision:text("revision").notNull(),leaseToken:uuid("lease_token").notNull(),leaseUntil:timestamp("lease_until",{withTimezone:true}).notNull(),state:text("state").notNull(),
});

export const schemaTables = {
  aiOperations,aiProviderCosts,smartSessions,smartNodes,smartDependencies,smartTurns,smartBootstraps,smartFeedback,smartActivity,smartRateWindows,smartDocuments,smartIndexJobs,
  citySources, citySourceChecks, cityRecords, cityRecordVersions,
  breakingBulletins,
  articleRevisionSocial, socialConnections, socialPublications, socialOauthStates, socialDeletionReceipts,
  studioAuditLogs,
  polls, pollVotes, pollRevisions,
  podcasts, podcastSocialPublications,
  aiPodcastProjects, aiPodcastAssets, aiPodcastJobs, aiPodcastAudit, aiPodcastVoiceSettings,
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
  editorQaArticles,
  publishRequests,
  livepointSubmissions,
  pageArrangements,
  storyThemes,
  storyThemeArticles,
  storyThemeSlugs,
  pushSubscriptions,
};

/** Studio Smart provider selection; secrets remain in the server environment. */
export const smartSettings = pgTable("smart_settings", {
  id:boolean("id").primaryKey().default(true),
  enabled:boolean("enabled").notNull().default(true),
  provider:text("provider",{enum:["minimax","openai"]}).notNull(),
  openaiModel:text("openai_model",{enum:["gpt-6.1-sol","gpt-6-luna"]}).notNull().default("gpt-6.1-sol"),
  version:integer("version").notNull().default(1),
  updatedBy:text("updated_by").references(()=>staffUsers.id,{onDelete:"set null"}),
  updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow(),
});

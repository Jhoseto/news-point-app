import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, sql } from "@newspoint/db/orm";
import { getDb, socialConnections, socialOauthStates, socialPublications, socialDeletionReceipts } from "@newspoint/db";
import { hasSocialPublishing } from "@newspoint/db/social-publishing";
import { socialOrigin } from "@newspoint/content";
import { FacebookClient, FACEBOOK_PERMISSIONS, facebookPermalink, facebookVersion, type FacebookPage } from "@newspoint/content/facebook";
import { makeSocialConfiguration } from "@newspoint/content/make-social";
import { decryptSocialSecret, encryptSocialSecret, pageSecretContext, verifyFacebookSignedRequest } from "@newspoint/content/social-secrets";
import { EditorError } from "./articles";
import { auditEvidence } from "./audit-context";
import type { Staff } from "./session";

const fresh = () => new Date(Date.now() + 600_000);
const stateContext = (id: string, actor: string) => `facebook-oauth:${id}:${actor}`;
type AuthorizedPages = { userId: string; pages: FacebookPage[] };
function admin(staff: Staff) { if (staff.role !== "master_admin") throw new EditorError(403, "forbidden", "Само мастър администраторът управлява връзката с Facebook."); }
export function socialPublicBase(): string {
  const configured = process.env.STUDIO_PUBLIC_URL?.replace(/\/+$/, "");
  const url = new URL(configured ?? "http://invalid/");
  if (!socialOrigin(url.origin) || url.pathname !== "/admin" || url.username || url.password || url.search || url.hash) throw new EditorError(422, "configuration", "Настройте HTTPS адреса на Studio за официалния или временния домейн.");
  return url.href.replace(/\/+$/, "");
}
async function ready() {
  if (!await hasSocialPublishing(getDb())) throw new EditorError(422, "migration_required", "Първо приложете миграция 39 за Facebook.");
}
export async function startFacebookConnection(staff: Staff) {
  admin(staff); await ready();
  if (process.env.SOCIAL_PUBLISHING_PROVIDER === "make") throw new EditorError(422, "provider", "Facebook се управлява чрез Make.");
  if (!/^\d+$/.test(process.env.META_APP_ID ?? "") || !process.env.META_APP_SECRET) throw new EditorError(422, "configuration", "Не е настроено Meta приложението.");
  // Validate the key before opening Facebook, not after the user grants consent.
  encryptSocialSecret("check", "configuration");
  const id = randomBytes(32).toString("base64url");
  const redirectUri = `${socialPublicBase()}/api/social/callback/`;
  await getDb().transaction(async tx => {
    await tx.delete(socialOauthStates).where(sql`${socialOauthStates.expiresAt} < now() or ${socialOauthStates.actorId} = ${staff.id}`);
    await tx.insert(socialOauthStates).values({ id, actorId: staff.id, redirectUri, phase: "authorize", expiresAt: fresh() });
  });
  const url = new URL(`https://www.facebook.com/${facebookVersion()}/dialog/oauth`);
  url.searchParams.set("client_id", process.env.META_APP_ID!); url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", id); url.searchParams.set("response_type", "code");
  if (process.env.META_LOGIN_CONFIG_ID) {
    url.searchParams.set("config_id", process.env.META_LOGIN_CONFIG_ID); url.searchParams.set("override_default_response_type", "true");
  } else url.searchParams.set("scope", FACEBOOK_PERMISSIONS.join(","));
  auditEvidence(null, { action: "facebook.connect" });
  return { url: url.href };
}
export async function finishFacebookConnection(staff: Staff, state: string, code: string) {
  admin(staff); await ready();
  if (!/^[A-Za-z0-9_-]{43}$/.test(state) || !code || code.length > 4096) throw new EditorError(400, "oauth_state", "Свързването е изтекло. Опитайте отново.");
  const [pending] = await getDb().delete(socialOauthStates).where(and(eq(socialOauthStates.id, state), eq(socialOauthStates.actorId, staff.id), eq(socialOauthStates.phase, "authorize"), gt(socialOauthStates.expiresAt, new Date()))).returning();
  if (!pending || pending.redirectUri !== `${socialPublicBase()}/api/social/callback/`) throw new EditorError(400, "oauth_state", "Свързването е изтекло. Опитайте отново.");
  const api = new FacebookClient("");
  const short = await api.exchangeCode(code, pending.redirectUri);
  const long = await api.exchangeLongLived(short.access_token);
  const client = new FacebookClient(long.access_token);
  const grants = await client.permissions();
  const user = await client.me();
  if (!/^\d+$/.test(user.id)) throw new EditorError(422, "page_access", "Facebook не потвърди профила.");
  if (!FACEBOOK_PERMISSIONS.every(p => grants.some(g => g.permission === p && g.status === "granted"))) throw new EditorError(422, "permissions", "Разрешете публикуването на снимки и коментари за страницата.");
  const pages = (await client.pages()).filter(p => /^\d+$/.test(p.id) && p.access_token && p.tasks && (p.tasks.includes("CREATE_CONTENT") || p.tasks.includes("MANAGE")) && (p.tasks.includes("MODERATE") || p.tasks.includes("MANAGE")));
  if (!pages.length) throw new EditorError(422, "page_access", "Профилът няма необходимия достъп за публикуване и коментари в страница.");
  const selection = randomBytes(32).toString("base64url");
  await getDb().insert(socialOauthStates).values({ id: selection, actorId: staff.id, redirectUri: pending.redirectUri, phase: "select",
    encryptedPages: encryptSocialSecret(JSON.stringify({ userId: user.id, pages }), stateContext(selection, staff.id)), expiresAt: fresh() });
  auditEvidence(null, { action: "facebook.authorized", pages: pages.map(p => ({ id: p.id, name: p.name })) });
  return selection;
}
export async function facebookSettings(staff: Staff, selection?: string) {
  admin(staff);
  const provider = process.env.SOCIAL_PUBLISHING_PROVIDER === "make" ? "make" as const : "meta" as const;
  if (!await hasSocialPublishing(getDb())) return { ready: false, provider, connection: null, pages: [], problems: [] };
  if (provider === "make") {
    const configured = makeSocialConfiguration();
    const problems = await getDb().select({ id: socialPublications.id, text: socialPublications.text, step: socialPublications.step, postId: socialPublications.postId }).from(socialPublications).where(eq(socialPublications.status, "uncertain")).limit(20);
    return { ready: true, provider, connection: configured ? { pageId: configured.pageId, name: configured.pageName, status: "connected", checkedAt: null } : null, pages: [], problems };
  }
  const [connection] = await getDb().select({ pageId: socialConnections.pageId, name: socialConnections.name, status: socialConnections.status, checkedAt: socialConnections.checkedAt }).from(socialConnections).where(eq(socialConnections.provider, "facebook"));
  let pages: { id: string; name: string }[] = [];
  if (selection && /^[A-Za-z0-9_-]{43}$/.test(selection)) {
    const [pending] = await getDb().select().from(socialOauthStates).where(and(eq(socialOauthStates.id, selection), eq(socialOauthStates.actorId, staff.id), eq(socialOauthStates.phase, "select"), gt(socialOauthStates.expiresAt, new Date())));
    if (pending?.encryptedPages) pages = (JSON.parse(decryptSocialSecret(pending.encryptedPages, stateContext(selection, staff.id))) as AuthorizedPages).pages.map(p => ({ id: p.id, name: p.name }));
  }
  const problems = await getDb().select({ id: socialPublications.id, text: socialPublications.text, step: socialPublications.step, postId: socialPublications.postId }).from(socialPublications).where(eq(socialPublications.status, "uncertain")).limit(20);
  return { ready: true, provider, connection: connection ?? null, pages, problems };
}
export async function selectFacebookPage(staff: Staff, selection: string, pageId: string) {
  admin(staff); await ready();
  if (process.env.SOCIAL_PUBLISHING_PROVIDER === "make") throw new EditorError(422, "provider", "Facebook се управлява чрез Make.");
  return getDb().transaction(async tx => {
    // Fixed lock serializes page changes with reconnect/disconnect and an initial connection.
    await tx.execute(sql`select pg_advisory_xact_lock(19661018,39)`);
    const [pending] = await tx.select().from(socialOauthStates).where(and(eq(socialOauthStates.id, selection), eq(socialOauthStates.actorId, staff.id), eq(socialOauthStates.phase, "select"), gt(socialOauthStates.expiresAt, new Date()))).for("update");
    if (!pending?.encryptedPages) throw new EditorError(422, "oauth_state", "Свързването е изтекло. Опитайте отново.");
    const authorized = JSON.parse(decryptSocialSecret(pending.encryptedPages, stateContext(selection, staff.id))) as AuthorizedPages;
    const page = authorized.pages.find(p => p.id === pageId);
    if (!page) throw new EditorError(422, "page_access", "Изберете разрешена Facebook страница.");
    const [previous] = await tx.select().from(socialConnections).where(eq(socialConnections.provider, "facebook"));
    // Jobs must never silently change their destination on a reconnect.
    if (previous && previous.pageId !== page.id) throw new EditorError(422, "page_locked", "Интеграцията вече е настроена за друга страница. Свържете отново същата страница.");
    const value = { provider: "facebook", pageId: page.id, name: page.name, encryptedToken: encryptSocialSecret(page.access_token, pageSecretContext(page.id)), metaUserId: authorized.userId, status: "connected", permissions: [...FACEBOOK_PERMISSIONS], connectedBy: staff.id, checkedAt: new Date(), updatedAt: new Date(), generation: (previous?.generation ?? 0) + 1 };
    await tx.insert(socialConnections).values(value).onConflictDoUpdate({ target: socialConnections.provider, set: value });
    await tx.delete(socialOauthStates).where(eq(socialOauthStates.id, selection));
    await tx.update(socialPublications).set({ pageId: page.id, status: "pending", errorCode: null, nextAttemptAt: new Date(), attempts: 0, updatedAt: new Date() })
      .where(and(eq(socialPublications.status, "failed"), eq(socialPublications.errorCode, "connection"), sql`${socialPublications.pageId} in (${page.id}, 'unconnected')`));
    auditEvidence(previous ? { pageId: previous.pageId, status: previous.status } : null, { pageId: page.id, name: page.name, status: "connected" });
    return { connected: true };
  });
}
export async function disconnectFacebook(staff: Staff) {
  admin(staff); await ready();
  if (process.env.SOCIAL_PUBLISHING_PROVIDER === "make") throw new EditorError(422, "provider", "Facebook се управлява чрез Make.");
  await getDb().transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(19661018,39)`);
    await tx.update(socialConnections).set({ encryptedToken: "", metaUserId: null, status: "disconnected", generation: sql`${socialConnections.generation} + 1`, updatedAt: new Date() }).where(eq(socialConnections.provider, "facebook"));
    await tx.delete(socialOauthStates).where(eq(socialOauthStates.actorId, staff.id));
  });
  auditEvidence(null, { status: "disconnected" }); return { connected: false };
}

/** Meta calls this directly. Signed request replaces Studio session authentication. */
export async function removeFacebookAuthorization(signedRequest: string) {
  const { userId } = verifyFacebookSignedRequest(signedRequest); await ready();
  const receipt = randomUUID();
  await getDb().transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(19661018,39)`);
    const [connection] = await tx.select().from(socialConnections).where(eq(socialConnections.metaUserId, userId)).for("update");
    if (connection) {
      await tx.update(socialConnections).set({ encryptedToken: "", metaUserId: null, status: "disconnected", generation: connection.generation + 1, updatedAt: new Date() }).where(eq(socialConnections.provider, "facebook"));
      if (connection.connectedBy) await tx.delete(socialOauthStates).where(eq(socialOauthStates.actorId, connection.connectedBy));
    }
    // A valid callback for another app user must not erase this Page owner's consent.
    const selections = await tx.select().from(socialOauthStates).where(eq(socialOauthStates.phase, "select"));
    for (const selection of selections) {
      if (!selection.encryptedPages) continue;
      const authorized = JSON.parse(decryptSocialSecret(selection.encryptedPages, stateContext(selection.id, selection.actorId))) as AuthorizedPages;
      if (authorized.userId === userId) await tx.delete(socialOauthStates).where(eq(socialOauthStates.id, selection.id));
    }
    await tx.delete(socialDeletionReceipts).where(sql`${socialDeletionReceipts.expiresAt} < now()`);
    await tx.insert(socialDeletionReceipts).values({ id: receipt, expiresAt: new Date(Date.now() + 30 * 86400_000) });
  });
  return { confirmation_code: receipt, url: `${socialPublicBase()}/api/social/deletion-status/?code=${receipt}` };
}

/** Admin explicitly supplies the existing object. Validate ownership and content; never issue a new POST. */
export async function reconcileFacebook(staff: Staff, jobId: string, objectId: string) {
  admin(staff); await ready();
  const [job] = await getDb().select().from(socialPublications).where(and(eq(socialPublications.id, jobId), eq(socialPublications.status, "uncertain")));
  const [connection] = await getDb().select().from(socialConnections).where(eq(socialConnections.provider, "facebook"));
  if (!job || !connection || connection.status !== "connected" || connection.pageId !== job.pageId) throw new EditorError(422, "not_ready", "Проверете връзката и публикацията.");
  const client = new FacebookClient(decryptSocialSecret(connection.encryptedToken, pageSecretContext(connection.pageId)));
  let values: Partial<typeof socialPublications.$inferInsert>;
  if (job.step === "comment" && job.postId) {
    const comment = (await client.comments(job.postId)).find(c => c.id === objectId && c.from?.id === job.pageId && c.message === job.articleUrl);
    if (!comment) throw new EditorError(422, "not_found", "Коментарът не съответства на тази новина.");
    values = { commentId: comment.id, status: "succeeded" };
  } else {
    const post = await client.post(objectId);
    const at = Date.parse(post.created_time ?? "");
    const photo = post.attachments?.data.find(a => a.media_type === "photo" && a.target?.id)?.target?.id;
    if (post.from?.id !== job.pageId || post.message !== job.text || !photo || !Number.isFinite(at) || Math.abs(at - (job.operationStartedAt ?? job.createdAt).getTime()) > 600_000) throw new EditorError(422, "not_found", "Постът не съответства на тази новина.");
    values = { photoId: photo, postId: post.id, permalink: facebookPermalink(post.permalink_url), status: "pending", step: "comment" };
  }
  const updated = await getDb().update(socialPublications).set({ ...values, errorCode: null, attempts: 0, leaseToken: null, leaseUntil: null, nextAttemptAt: new Date(), updatedAt: new Date() })
    .where(and(eq(socialPublications.id, job.id), eq(socialPublications.status, "uncertain"), sql`(${socialPublications.leaseUntil} is null or ${socialPublications.leaseUntil} < now())`)).returning({ id: socialPublications.id });
  if (!updated.length) throw new EditorError(409, "busy", "Проверката още се изпълнява. Опитайте след малко.");
  auditEvidence({ jobId, status: "uncertain" }, { jobId, objectId, status: values.status ?? "pending" });
  return { resolved: true };
}

import { createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { arrangementDocumentSchema, emptyArrangement, placeHomeHero, type ArrangementDocument, type HomeHeroPosition } from "@newspoint/content";
import type { ScriptDb } from "./node";
import { pageArrangements, outboxEvents } from "./schema";

export type ArrangementTx = Pick<ScriptDb, "execute" | "select" | "insert" | "update" | "delete">;
export const readArrangementDocument = (value: unknown): ArrangementDocument => arrangementDocumentSchema.safeParse(value).data ?? emptyArrangement();

/** All arrangement writers share this lock, including publication, deletion and first creation.
 * No article row may be locked after acquiring it (article writers lock their row first).
 */
export async function lockArrangements(tx: Pick<ScriptDb, "execute">) {
  await tx.execute(sql`select pg_advisory_xact_lock(71020, 1)`);
}

export async function arrangementState(tx: Pick<ScriptDb, "select">, pageKey: string) {
  const rows = await tx.select().from(pageArrangements).where(and(eq(pageArrangements.pageKey, pageKey), inArray(pageArrangements.status, ["draft", "published"]))).orderBy(pageArrangements.status);
  const version = createHash("sha256").update(JSON.stringify(rows.map(row => [row.id, row.status, row.document, row.note]))).digest("hex");
  return { draft: rows.find(row => row.status === "draft"), published: rows.find(row => row.status === "published"), version };
}

export async function writeArrangementDraft(tx: ArrangementTx, pageKey: string, document: ArrangementDocument, note: string, actorId: string | null) {
  const { draft } = await arrangementState(tx, pageKey);
  if (draft) await tx.update(pageArrangements).set({ document, note, placedBy: actorId }).where(eq(pageArrangements.id, draft.id));
  else await tx.insert(pageArrangements).values({ pageKey, status: "draft", document, note, placedBy: actorId });
}

/** Caller holds the arrangement lock and supplies only the document it intends to publish. */
export async function writePublishedArrangement(tx: ArrangementTx, pageKey: string, document: ArrangementDocument, note: string, actorId: string | null, path: string, title: string) {
  const { published } = await arrangementState(tx, pageKey);
  if (published) await tx.update(pageArrangements).set({ status: "history" }).where(eq(pageArrangements.id, published.id));
  await tx.insert(pageArrangements).values({ pageKey, status: "published", document, note, placedBy: actorId, publishedAt: new Date() });
  const history = await tx.select({ id: pageArrangements.id }).from(pageArrangements).where(and(eq(pageArrangements.pageKey, pageKey), eq(pageArrangements.status, "history"))).orderBy(desc(pageArrangements.createdAt), desc(pageArrangements.id));
  const extra = history.slice(15).map(row => row.id);
  if (extra.length) await tx.delete(pageArrangements).where(inArray(pageArrangements.id, extra));
  await tx.insert(outboxEvents).values({ type: "layout.updated", entityId: null, version: 1, payload: { path, title, topics: [] } });
}

/** Patches live and draft independently: an article publication must never publish unrelated draft changes. */
export async function publishHomeHero(tx: ArrangementTx, articleId: string, position: HomeHeroPosition, actorId: string | null, actorName: string) {
  await lockArrangements(tx);
  const state = await arrangementState(tx, "home");
  const before = readArrangementDocument(state.published?.document);
  const at = new Date().toISOString();
  const after = placeHomeHero(before, articleId, position, actorName, at);
  const draft = placeHomeHero(readArrangementDocument(state.draft?.document ?? state.published?.document), articleId, position, actorName, at);
  await writeArrangementDraft(tx, "home", draft, state.draft?.note ?? state.published?.note ?? "", actorId);
  await writePublishedArrangement(tx, "home", after, state.published?.note ?? "", actorId, "/", "Начало");
  return { before, after };
}

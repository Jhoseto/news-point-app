import type { AuditArea, AuditDetails, AuditValue } from "./audit-types";

export type AuditInput = Record<string, unknown>;
const actions: Record<string, string> = {
  create: "Създаване", save: "Запазване", edit: "Редактиране", publish: "Публикуване", unpublish: "Сваляне от сайта", hide: "Скриване",
  delete: "Изтриване", place: "Поставяне на позиция", revert: "Връщане на подреждане", correct: "Корекция на гласове",
  addArticle: "Добавяне на статия в тема", removeArticle: "Премахване на статия от тема", assignArticle: "Свързване на статия с тема",
  reorder: "Промяна на реда", replaceArticles: "Замяна на статии в тема", rewrite: "Преработка на сценарий",
  produce: "Създаване на аудио", remix: "Нов аудио микс", regenerateSegment: "Повторно озвучаване", regenerateCover: "Нова корица",
  cancel: "Отказ на задача", retry: "Повторение на задача", music: "Генериране на музика", approveMusic: "Одобряване на музика", setVoices: "Промяна на гласове",
  "sign-in/email": "Вход", "sign-out": "Изход", "change-password": "Промяна на парола", "reset-password": "Възстановяване на парола", "request-password-reset": "Заявка за възстановяване",
};
export const textValue = (value: unknown, max = 240) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max) : "";
export function auditDescriptor(path: string, method: string, input: AuditInput) {
  const clean = path.replace(/^\/admin(?=\/|$)/, "").replace(/(\/auth\/reset-password)\/[^/]+/g, "$1/[redacted]").replace(/\/+$/, "") || "/";
  const isRead = method === "GET" || method === "HEAD";
  let area: AuditArea = "navigation";
  if (clean.includes("/articles")) area = "articles";
  else if (clean.includes("/arrangements") || clean === "/arrange") area = "arrangements";
  else if (clean.includes("/media")) area = "media";
  else if (clean.includes("/stories")) area = "stories";
  else if (clean.includes("/polls")) area = "polls";
  else if (clean.includes("/podcasts")) area = "podcasts";
  else if (clean.includes("/staff") || clean.includes("/users")) area = "users";
  else if (clean.includes("/profile")) area = "profile";
  else if (clean.includes("/submissions") || clean.includes("/my-news")) area = "submissions";
  else if (clean.includes("/auth") || clean === "/login") area = "auth";
  else if (clean.includes("/logs")) area = "logs";
  const routeId = clean.match(/\/(?:articles|staff)\/([^/]+)/)?.[1] ?? "";
  let verb = textValue(input.action, 80) || (isRead ? "read" : method === "DELETE" ? "delete" : method === "PATCH" ? "edit" : "save");
  if (area === "auth") verb = (clean.split("/auth/")[1] ?? verb).replace("/[redacted]", "");
  else if (clean.endsWith("/upload")) verb = "upload";
  else if (clean.endsWith("/optimize")) verb = "optimize";
  else if (clean.endsWith("/publish")) verb = "publish";
  else if (clean.endsWith("/visibility")) verb = "visibility";
  else if (clean.endsWith("/preview")) verb = "preview";
  else if (clean.endsWith("/revisions") && !isRead) verb = "revision";
  else if (clean.endsWith("/photo") && !isRead) verb = method === "DELETE" ? "deletePhoto" : "uploadPhoto";
  else if (area === "media" && /^\/api\/editor\/media\/[^/]+$/.test(clean) && method === "PATCH") verb = "rename";
  else if (clean === "/api/editor/articles" && !isRead) verb = "create";
  else if (clean === "/api/staff" && !isRead) verb = "create";
  const entityId = textValue(routeId || input.id || input.creationId || (input.input as AuditInput | undefined)?.id || input.jobId || input.assetId || input.themeId || input.projectId || input.pageKey || input.articleId || (isRead && ["podcasts", "submissions"].includes(area) ? input.key || input.path : ""));
  const entityLabel = textValue(input.title || (input.draft as AuditInput | undefined)?.title || input.name || input.alt || input.pageKey || input.email);
  const labels: Record<string, string> = { read: "Преглед / търсене", upload: "Качване на файл", optimize: "Оптимизиране на снимка", visibility: "Промяна на видимост", preview: "Предварителен преглед", revision: "Запазване на редакция", deletePhoto: "Изтриване на снимка", uploadPhoto: "Качване на снимка", rename: "Преименуване на снимка" };
  return { area, verb, action: `${area}.${verb}`, actionLabel: actions[verb] || labels[verb] || `${method} ${clean}`, entityId, entityLabel, entityKind: area, path: clean };
}

// Explicit allow-list: no passwords, cookies, reset tokens, arbitrary private payloads or reader contacts.
const fields = new Set("action id themeId articleId articleIds projectId jobId assetId segmentId pageKey slot hours historyId expectedRevision revision listenEnabled visible isPublic role status kind note reason alex maya preset direction prompt q query view cursor limit publish actor area outcome period from to sort size page anchor export category categoryId author source hero dir date folder offset alt".split(" "));
export function safeAuditInput(input: AuditInput): AuditDetails {
  const result: AuditDetails = {};
  for (const [key, value] of Object.entries(input)) {
    if (!fields.has(key)) continue;
    if (typeof value === "string") result[key] = textValue(value, 1200);
    else if (typeof value === "number" && Number.isFinite(value) || typeof value === "boolean" || value === null) result[key] = value as AuditValue;
    else if (Array.isArray(value) && value.every(item => typeof item === "string")) result[key] = value.slice(0, 200).map(item => textValue(item));
  }
  return result;
}

export interface AuditChange { field: string; before: AuditValue; after: AuditValue }
/** Array order matters: queues and story positions are editorial decisions. */
export function auditChanges(before: AuditValue, after: AuditValue, prefix = ""): AuditChange[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (before && after && !Array.isArray(before) && !Array.isArray(after) && typeof before === "object" && typeof after === "object") {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap(key => auditChanges(before[key] ?? null, after[key] ?? null, prefix ? `${prefix}.${key}` : key));
  }
  return [{ field: prefix || "Обект", before, after }];
}

import { decodeHTML } from "entities";

export function htmlToPlainText(html: string): string {
  return decodeHTML(html.replace(/<[^>]*>/g, " "))
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function pathFromLink(link: string): string {
  const { pathname } = new URL(link);
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

export function wpGmtToDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value.endsWith("Z") ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

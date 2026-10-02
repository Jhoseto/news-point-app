/**
 * Server-rendered `<script type="application/ld+json">` writer.
 *
 * Each builder under `@/lib/jsonld` produces a schema.org object that this
 * component serialises once. Pass either a single object or an array; the
 * array form is wrapped in a `@graph` envelope so it can sit in one script tag.
 */

import { serializeGraph, type JsonLdObject } from "@/lib/jsonld";

export function JsonLd({ data, id }: { data: JsonLdObject | JsonLdObject[]; id?: string }) {
  const objects = Array.isArray(data) ? data : [data];
  const body = serializeGraph(objects);
  if (!body) return null;
  return <script id={id} type="application/ld+json" dangerouslySetInnerHTML={{ __html: body }} />;
}
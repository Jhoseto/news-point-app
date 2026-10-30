-- Native PostgreSQL full-content retrieval; no extension or generated column.
-- Run this single statement outside a transaction on DATABASE_URL_SESSION.
-- CONCURRENTLY keeps editorial inserts/updates/deletes available during build.
-- The rolling six-month/publication-date filter stays in the query: now() is
-- not immutable and must never be frozen into a partial-index predicate.
-- If an interrupted build leaves an INVALID index, inspect it before retrying;
-- IF NOT EXISTS is intentionally omitted so an invalid index cannot be skipped.
create index concurrently articles_smart_public_fulltext_idx
  on public.articles using gin (
    to_tsvector('simple',coalesce(title,'')||' '||coalesce(excerpt,'')||' '||body::text)
  ) where is_public;

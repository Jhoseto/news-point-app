CREATE TABLE compass_members (user_id TEXT PRIMARY KEY, granted_by TEXT NOT NULL, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE compass_imports (id TEXT PRIMARY KEY, author TEXT NOT NULL, base_id TEXT NOT NULL, object_key TEXT NOT NULL, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE compass_proposals (id TEXT PRIMARY KEY, base_id TEXT NOT NULL, import_id TEXT NOT NULL REFERENCES compass_imports(id), author TEXT NOT NULL, entity_id TEXT NOT NULL, evidence_id TEXT NOT NULL, question_id TEXT, option_id TEXT, reason TEXT NOT NULL, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX compass_proposals_by_base ON compass_proposals(base_id, created_at);
--> statement-breakpoint
CREATE TABLE compass_reviews (proposal_id TEXT NOT NULL REFERENCES compass_proposals(id), actor TEXT NOT NULL, decision TEXT NOT NULL CHECK(decision IN ('approve','reject')), adjudicate INTEGER NOT NULL CHECK(adjudicate IN (0,1)), reason TEXT NOT NULL, source_checked INTEGER NOT NULL CHECK(source_checked IN (0,1)), created_at TEXT NOT NULL, PRIMARY KEY(proposal_id,actor));
--> statement-breakpoint
CREATE UNIQUE INDEX compass_one_adjudication ON compass_reviews(proposal_id) WHERE adjudicate=1;
--> statement-breakpoint
CREATE TABLE compass_releases (id TEXT PRIMARY KEY, parent_id TEXT NOT NULL, object_key TEXT NOT NULL, digest TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE compass_publications (proposal_id TEXT PRIMARY KEY REFERENCES compass_proposals(id), release_id TEXT NOT NULL REFERENCES compass_releases(id));
--> statement-breakpoint
CREATE TABLE compass_withdrawals (release_id TEXT PRIMARY KEY REFERENCES compass_releases(id), actor TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE compass_head (slot INTEGER PRIMARY KEY CHECK(slot=1), release_id TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE compass_corrections (id TEXT PRIMARY KEY, entity_id TEXT, source_url TEXT NOT NULL, claim TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','declined')), created_at TEXT NOT NULL, reason TEXT);
--> statement-breakpoint
CREATE TABLE compass_limits (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL CHECK(count BETWEEN 1 AND 10), expires_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX compass_limits_expiry ON compass_limits(expires_at);
--> statement-breakpoint
CREATE TABLE compass_audit (seq INTEGER PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, object_id TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE compass_guard (ok INTEGER CHECK(ok=1));
--> statement-breakpoint
CREATE TRIGGER compass_reviews_immutable BEFORE UPDATE ON compass_reviews BEGIN SELECT RAISE(ABORT,'Immutable review'); END;
--> statement-breakpoint
CREATE TRIGGER compass_reviews_keep BEFORE DELETE ON compass_reviews BEGIN SELECT RAISE(ABORT,'Immutable review'); END;
--> statement-breakpoint
CREATE TRIGGER compass_releases_immutable BEFORE UPDATE ON compass_releases BEGIN SELECT RAISE(ABORT,'Immutable release'); END;
--> statement-breakpoint
CREATE TRIGGER compass_releases_keep BEFORE DELETE ON compass_releases BEGIN SELECT RAISE(ABORT,'Immutable release'); END;
--> statement-breakpoint
CREATE TRIGGER compass_audit_immutable BEFORE UPDATE ON compass_audit BEGIN SELECT RAISE(ABORT,'Immutable audit event'); END;
--> statement-breakpoint
CREATE TRIGGER compass_audit_keep BEFORE DELETE ON compass_audit BEGIN SELECT RAISE(ABORT,'Immutable audit event'); END;
--> statement-breakpoint
CREATE TRIGGER compass_proposals_immutable BEFORE UPDATE ON compass_proposals BEGIN SELECT RAISE(ABORT,'Immutable proposal'); END;
--> statement-breakpoint
CREATE TRIGGER compass_proposals_keep BEFORE DELETE ON compass_proposals BEGIN SELECT RAISE(ABORT,'Immutable proposal'); END;

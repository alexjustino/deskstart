-- Deskstart — migration 002: folder, file and url steps.
--
-- SQLite cannot widen a CHECK in place, so the table is rebuilt: every row is
-- carried across with the columns it had, and the index is recreated. The
-- domain owns what each kind's config_json contains (ADR-010); the host only
-- refuses a kind it does not know how to act on.

CREATE TABLE step_new (
    id          TEXT    PRIMARY KEY,
    profile_id  TEXT    NOT NULL REFERENCES profile (id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    kind        TEXT    NOT NULL CHECK (kind IN ('app', 'folder', 'file', 'url')),
    config_json TEXT    NOT NULL DEFAULT '{}',
    timing_json TEXT    NOT NULL DEFAULT '{}',
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
);

INSERT INTO step_new (id, profile_id, position, kind, config_json, timing_json, created_at, updated_at)
SELECT id, profile_id, position, kind, config_json, timing_json, created_at, updated_at FROM step;

DROP TABLE step;

ALTER TABLE step_new RENAME TO step;

CREATE INDEX idx_step_profile ON step (profile_id, position);

-- Deskstart — migration 007: a virtual machine is a step (F8).
--
-- The same rebuild as 002 and 006, for the same reason: SQLite cannot widen a
-- CHECK in place. Every row is carried across with every column it has.

CREATE TABLE step_new (
    id          TEXT    PRIMARY KEY,
    profile_id  TEXT    NOT NULL REFERENCES profile (id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    kind        TEXT    NOT NULL CHECK (
                    kind IN ('app', 'folder', 'file', 'url', 'bookmarks', 'terminal', 'editor', 'vm')
                ),
    config_json TEXT    NOT NULL DEFAULT '{}',
    timing_json TEXT    NOT NULL DEFAULT '{}',
    wait_json   TEXT    NOT NULL DEFAULT '{}',
    place_json  TEXT    NOT NULL DEFAULT '{}',
    reviewed    INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
);

INSERT INTO step_new (id, profile_id, position, kind, config_json, timing_json, wait_json,
                      place_json, reviewed, created_at, updated_at)
SELECT id, profile_id, position, kind, config_json, timing_json, wait_json,
       place_json, reviewed, created_at, updated_at FROM step;

DROP TABLE step;

ALTER TABLE step_new RENAME TO step;

CREATE INDEX idx_step_profile ON step (profile_id, position);

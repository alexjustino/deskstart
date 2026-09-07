-- Deskstart — migration 006: the steps that call a tool.
--
-- A bookmark folder, a Windows Terminal window and a folder opened in VS Code
-- (F7). SQLite cannot widen a CHECK in place, so the table is rebuilt the way
-- migration 002 rebuilt it — every row carried across with every column it has
-- gained since, and the index recreated.

CREATE TABLE step_new (
    id          TEXT    PRIMARY KEY,
    profile_id  TEXT    NOT NULL REFERENCES profile (id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    kind        TEXT    NOT NULL CHECK (
                    kind IN ('app', 'folder', 'file', 'url', 'bookmarks', 'terminal', 'editor')
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

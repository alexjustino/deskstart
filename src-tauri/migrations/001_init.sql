-- Deskstart — migration 001: the workspace, profiles, steps, runs and the run log.
--
-- Migrations are forward-only and numbered. `workspace.schema_version` records
-- the highest migration applied. A release that adds a migration must be
-- covered by a round-trip test that opens a database at version N-1 and
-- migrates it without loss.
--
-- Every timestamp column is UTC, ISO 8601 with milliseconds and a trailing Z.

PRAGMA foreign_keys = ON;

-- ── Workspace ──────────────────────────────────────────────────────────────
CREATE TABLE workspace (
    id             INTEGER PRIMARY KEY CHECK (id = 1),   -- single row, by design
    schema_version INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO workspace (id) VALUES (1);

-- ── Profiles ───────────────────────────────────────────────────────────────
-- A profile is a named, ordered list of steps. `imported_unreviewed` is the
-- review gate (ADR-013): while it is 1 the host refuses to run the profile.
CREATE TABLE profile (
    id                  TEXT    PRIMARY KEY,
    name                TEXT    NOT NULL,
    position            INTEGER NOT NULL,
    imported_unreviewed INTEGER NOT NULL DEFAULT 0 CHECK (imported_unreviewed IN (0, 1)),
    created_at          TEXT    NOT NULL,
    updated_at          TEXT    NOT NULL
);

CREATE INDEX idx_profile_position ON profile (position);

-- ── Steps ──────────────────────────────────────────────────────────────────
-- `config_json` is the step's own shape, owned and validated by the domain
-- (ADR-010); the host stores it and reads back only what it needs to act.
-- `timing_json` arrives with F2 and is empty until then.
CREATE TABLE step (
    id          TEXT    PRIMARY KEY,
    profile_id  TEXT    NOT NULL REFERENCES profile (id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    kind        TEXT    NOT NULL CHECK (kind IN ('app')),
    config_json TEXT    NOT NULL DEFAULT '{}',
    timing_json TEXT    NOT NULL DEFAULT '{}',
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
);

CREATE INDEX idx_step_profile ON step (profile_id, position);

-- ── Runs ───────────────────────────────────────────────────────────────────
-- A run remembers the profile's name itself: the log must still read when the
-- profile has been renamed or removed. A run cannot be deleted while it has
-- events (RESTRICT): removing history is a tombstone, not a delete (ADR-011).
CREATE TABLE run (
    id           TEXT PRIMARY KEY,
    profile_id   TEXT REFERENCES profile (id) ON DELETE SET NULL,
    profile_name TEXT NOT NULL,
    mode         TEXT NOT NULL CHECK (mode IN ('real', 'dry')),
    trigger      TEXT NOT NULL CHECK (trigger IN ('button', 'shortcut', 'schedule')),
    started_at   TEXT NOT NULL,
    finished_at  TEXT,
    outcome      TEXT CHECK (outcome IS NULL OR outcome IN
                     ('completed', 'completed_with_failures', 'failed', 'stopped'))
);

CREATE INDEX idx_run_started ON run (started_at DESC);

-- ── The run log ────────────────────────────────────────────────────────────
-- Insert-only. The two triggers below are the promise of ADR-011: no code path
-- in the product can rewrite what happened, and neither can a curious SQL
-- client. `seq` orders events within a run independently of the clock.
CREATE TABLE event (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id       TEXT    NOT NULL REFERENCES run (id) ON DELETE RESTRICT,
    seq          INTEGER NOT NULL,
    at           TEXT    NOT NULL,
    step_id      TEXT,
    kind         TEXT    NOT NULL,
    payload_json TEXT    NOT NULL DEFAULT '{}',
    UNIQUE (run_id, seq)
);

CREATE INDEX idx_event_run ON event (run_id, seq);

CREATE TRIGGER event_is_append_only_on_update
BEFORE UPDATE ON event
BEGIN
    SELECT RAISE(ABORT, 'the run log is append-only');
END;

CREATE TRIGGER event_is_append_only_on_delete
BEFORE DELETE ON event
BEGIN
    SELECT RAISE(ABORT, 'the run log is append-only');
END;

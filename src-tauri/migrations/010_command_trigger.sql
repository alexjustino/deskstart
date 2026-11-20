-- Deskstart — migration 010: a run started from the command line can be logged.
--
-- F9 added a fourth reason a run starts — `deskstart.exe --run <id>`, the
-- "command" trigger — to the domain and to the host's list, but not to this
-- table's CHECK, which 001 wrote with three. Every run asked for that way was
-- refused by the database. This widens the CHECK.
--
-- SQLite cannot widen a CHECK in place, so `run` is rebuilt the way SQLite
-- documents for a table others refer to: the migration runner turns foreign
-- keys off around it (they cannot change inside a transaction) and checks,
-- before it commits, that nothing points at nothing. `event` refers to `run`
-- by name; once the new table has the name and every row, every line of the
-- log refers to exactly what it did before. Not a single event is touched.

CREATE TABLE run_new (
    id           TEXT PRIMARY KEY,
    profile_id   TEXT REFERENCES profile (id) ON DELETE SET NULL,
    profile_name TEXT NOT NULL,
    mode         TEXT NOT NULL CHECK (mode IN ('real', 'dry')),
    trigger      TEXT NOT NULL CHECK (trigger IN ('button', 'shortcut', 'schedule', 'command')),
    started_at   TEXT NOT NULL,
    finished_at  TEXT,
    outcome      TEXT CHECK (outcome IS NULL OR outcome IN
                     ('completed', 'completed_with_failures', 'failed', 'stopped'))
);

INSERT INTO run_new (id, profile_id, profile_name, mode, trigger, started_at, finished_at, outcome)
SELECT id, profile_id, profile_name, mode, trigger, started_at, finished_at, outcome
FROM run;

DROP TABLE run;

ALTER TABLE run_new RENAME TO run;

CREATE INDEX idx_run_started ON run (started_at DESC);

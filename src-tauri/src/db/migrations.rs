//! Forward-only, numbered migrations.
//!
//! Each migration runs inside a transaction and bumps `workspace.schema_version`.
//! There is no down-migration: a mistake is corrected by a new migration, never
//! by rewriting an applied one — an applied migration is history, and history
//! already ran on somebody's machine.

use rusqlite::Connection;

use crate::error::{Error, Result};

/// Every migration, in order. The index plus one is the schema version it
/// produces, so a migration can never be reordered without the compiler and the
/// round-trip test both objecting.
const MIGRATIONS: &[(&str, &str)] = &[
    ("001_init", include_str!("../../migrations/001_init.sql")),
    (
        "002_step_kinds",
        include_str!("../../migrations/002_step_kinds.sql"),
    ),
    ("003_wait", include_str!("../../migrations/003_wait.sql")),
    (
        "004_review",
        include_str!("../../migrations/004_review.sql"),
    ),
    (
        "005_placement",
        include_str!("../../migrations/005_placement.sql"),
    ),
    (
        "006_tool_steps",
        include_str!("../../migrations/006_tool_steps.sql"),
    ),
    (
        "007_vm_steps",
        include_str!("../../migrations/007_vm_steps.sql"),
    ),
    (
        "008_triggers",
        include_str!("../../migrations/008_triggers.sql"),
    ),
    (
        "009_settings",
        include_str!("../../migrations/009_settings.sql"),
    ),
    (
        "010_command_trigger",
        include_str!("../../migrations/010_command_trigger.sql"),
    ),
];

/// Every migration, name and SQL, in the order they apply.
///
/// Public so the round-trip test can walk the versions one at a time — the
/// runner itself only ever goes to head, which is right for the product and
/// wrong for a test that must stand at each step of somebody's history.
pub fn sources() -> &'static [(&'static str, &'static str)] {
    MIGRATIONS
}

/// The schema version this build expects.
pub fn target_version() -> i64 {
    MIGRATIONS.len() as i64
}

/// Read the version currently stored in the database. A database that has never
/// been migrated has no `workspace` table yet, and reports 0.
pub fn current_version(conn: &Connection) -> i64 {
    conn.query_row(
        "SELECT schema_version FROM workspace WHERE id = 1",
        [],
        |r| r.get::<_, i64>(0),
    )
    .unwrap_or(0)
}

/// Apply every migration the database has not seen yet.
pub fn apply(conn: &Connection) -> Result<()> {
    let from = current_version(conn);
    let to = target_version();

    if from >= to {
        log::debug!("schema is at version {from}; nothing to apply");
        return Ok(());
    }

    // Foreign keys are off while a migration runs and checked before it
    // commits — the procedure SQLite documents for rebuilding a table others
    // refer to (010 rebuilds `run`, which `event` refers to). The setting
    // cannot change inside a transaction, so it is set around each one, and
    // put back as it was found.
    let enforced: i64 = conn.pragma_query_value(None, "foreign_keys", |row| row.get(0))?;
    conn.pragma_update(None, "foreign_keys", "OFF")?;
    let applied = (|| -> Result<()> {
        for (index, (name, sql)) in MIGRATIONS.iter().enumerate() {
            let version = index as i64 + 1;
            if version <= from {
                continue;
            }

            log::info!("applying migration {name}");
            let step = (|| -> Result<()> {
                conn.execute_batch(&format!(
                    "BEGIN;
                     {sql}
                     UPDATE workspace SET schema_version = {version} WHERE id = 1;"
                ))?;
                let dangling: i64 =
                    conn.query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |row| {
                        row.get(0)
                    })?;
                if dangling > 0 {
                    return Err(Error::InvalidInput(
                        "a migration would have left a reference pointing at nothing",
                    ));
                }
                conn.execute_batch("COMMIT;")?;
                Ok(())
            })();
            if let Err(error) = step {
                // Nothing half-done stays: the workspace is as it was before.
                let _ = conn.execute_batch("ROLLBACK;");
                return Err(error);
            }
        }
        Ok(())
    })();
    if enforced == 1 {
        conn.pragma_update(None, "foreign_keys", "ON")?;
    }
    applied?;

    log::info!("schema migrated from version {from} to {to}");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn memory() -> Connection {
        let conn = Connection::open_in_memory().expect("in-memory database");
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        conn
    }

    #[test]
    fn applies_from_empty() {
        let conn = memory();
        assert_eq!(current_version(&conn), 0);

        apply(&conn).expect("migrate");

        assert_eq!(current_version(&conn), target_version());
    }

    /// Apply the first `count` migrations only, as an older build would have.
    fn apply_up_to(conn: &Connection, count: usize) {
        for (index, (_, sql)) in MIGRATIONS.iter().take(count).enumerate() {
            conn.execute_batch(&format!(
                "BEGIN; {sql} UPDATE workspace SET schema_version = {} WHERE id = 1; COMMIT;",
                index + 1
            ))
            .expect("an older migration");
        }
    }

    #[test]
    fn every_trigger_the_host_knows_can_be_logged() {
        // 001 wrote three; F9 added "command" everywhere but the CHECK, and a
        // run asked for by `--run` was refused by the database (010).
        let conn = memory();
        apply(&conn).expect("migrate");
        for trigger in crate::db::runs::TRIGGERS {
            conn.execute(
                "INSERT INTO run (id, profile_name, mode, trigger, started_at)
                 VALUES (?1, 'P', 'real', ?2, '2026-11-20T00:00:00Z')",
                rusqlite::params![format!("run-{trigger}"), trigger],
            )
            .unwrap_or_else(|e| panic!("trigger {trigger} refused: {e}"));
        }
    }

    #[test]
    fn widening_the_trigger_keeps_every_run_and_every_line_of_the_log() {
        // A workspace as 1.0.0 left it: runs with their events.
        let conn = memory();
        apply_up_to(&conn, 9);
        conn.execute_batch(
            "INSERT INTO run (id, profile_name, mode, trigger, started_at, finished_at, outcome)
             VALUES ('r1', 'Morning', 'real', 'schedule', '2026-11-01T07:30:00Z',
                     '2026-11-01T07:31:00Z', 'completed');
             INSERT INTO event (run_id, seq, at, step_id, kind, payload_json)
             VALUES ('r1', 1, '2026-11-01T07:30:00Z', NULL, 'started', '{}'),
                    ('r1', 2, '2026-11-01T07:31:00Z', NULL, 'finished', '{}');",
        )
        .expect("a 1.0.0 log");

        apply(&conn).expect("migrate to the current schema");

        let (runs, events): (i64, i64) = conn
            .query_row(
                "SELECT (SELECT count(*) FROM run), (SELECT count(*) FROM event e JOIN run r ON r.id = e.run_id)",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!((runs, events), (1, 2));
        let outcome: String = conn
            .query_row("SELECT outcome FROM run WHERE id = 'r1'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(outcome, "completed");
        // The log still refers to `run`, and nothing dangles.
        let broken: i64 = conn
            .query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(broken, 0);
        // The log is still append-only, and a run still cannot be deleted under it.
        assert!(conn.execute("DELETE FROM event", []).is_err());
        assert!(conn.execute("DELETE FROM run WHERE id = 'r1'", []).is_err());
        // And a command-line run is welcome now.
        conn.execute(
            "INSERT INTO run (id, profile_name, mode, trigger, started_at)
             VALUES ('r2', 'Morning', 'real', 'command', '2026-11-20T00:00:00Z')",
            [],
        )
        .expect("a command-line run");
        let old_table: i64 = conn
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE name = 'run_new'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(old_table, 0);
    }

    #[test]
    fn is_idempotent() {
        let conn = memory();
        apply(&conn).expect("first");
        apply(&conn).expect("second");
        apply(&conn).expect("third");

        assert_eq!(current_version(&conn), target_version());
    }

    #[test]
    fn creates_every_table_the_product_needs() {
        let conn = memory();
        apply(&conn).expect("migrate");

        for table in ["workspace", "profile", "step", "run", "event"] {
            let found: i64 = conn
                .query_row(
                    "SELECT count(*) FROM sqlite_master WHERE name = ?1",
                    [table],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            assert_eq!(found, 1, "table `{table}` is missing after migration");
        }
    }

    #[test]
    fn workspace_holds_exactly_one_row() {
        let conn = memory();
        apply(&conn).expect("migrate");

        let inserted = conn.execute("INSERT INTO workspace (id) VALUES (2)", []);
        assert!(inserted.is_err(), "a second workspace row must be rejected");
    }

    #[test]
    fn the_run_log_refuses_updates_and_deletes() {
        let conn = memory();
        apply(&conn).expect("migrate");
        conn.execute_batch(
            "INSERT INTO profile (id, name, position, created_at, updated_at)
               VALUES ('p', 'Morning', 0, 't', 't');
             INSERT INTO run (id, profile_id, profile_name, mode, trigger, started_at)
               VALUES ('r', 'p', 'Morning', 'real', 'button', 't');
             INSERT INTO event (run_id, seq, at, kind) VALUES ('r', 1, 't', 'run_started');",
        )
        .expect("seed");

        let updated = conn.execute("UPDATE event SET kind = 'forged' WHERE seq = 1", []);
        assert!(updated.is_err(), "an event must not be rewritable");

        let deleted = conn.execute("DELETE FROM event WHERE seq = 1", []);
        assert!(deleted.is_err(), "an event must not be deletable");

        // And a run with events cannot be swept away underneath them.
        let run_deleted = conn.execute("DELETE FROM run WHERE id = 'r'", []);
        assert!(
            run_deleted.is_err(),
            "a run with events must not be deletable"
        );

        let kind: String = conn
            .query_row("SELECT kind FROM event WHERE seq = 1", [], |r| r.get(0))
            .expect("still there");
        assert_eq!(kind, "run_started");
    }
}

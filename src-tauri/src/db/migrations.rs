//! Forward-only, numbered migrations.
//!
//! Each migration runs inside a transaction and bumps `workspace.schema_version`.
//! There is no down-migration: a mistake is corrected by a new migration, never
//! by rewriting an applied one — an applied migration is history, and history
//! already ran on somebody's machine.

use rusqlite::Connection;

use crate::error::Result;

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

    for (index, (name, sql)) in MIGRATIONS.iter().enumerate() {
        let version = index as i64 + 1;
        if version <= from {
            continue;
        }

        log::info!("applying migration {name}");
        conn.execute_batch(&format!(
            "BEGIN;
             {sql}
             UPDATE workspace SET schema_version = {version} WHERE id = 1;
             COMMIT;"
        ))?;
    }

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

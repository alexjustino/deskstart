//! The promise `VERSIONING.md` makes about every release: a database written by
//! the previous version opens in this one, migrated, without loss.
//!
//! Migrations are forward-only and numbered, so the interesting case is not
//! "does an empty database migrate" — the unit tests cover that — but "does a
//! database that somebody has been *using* migrate". So this walks the versions
//! one at a time, writing rows at each step with only the columns that existed
//! then, and checks at the end that everything written along the way is still
//! there and that the schema is at head.
//!
//! It runs against a file, not memory: a migration that only works on a fresh
//! connection is a migration that has never met a real workspace.

use std::fs;
use std::path::PathBuf;

use deskstart_lib::db::migrations;
use rusqlite::Connection;

struct Scratch {
    path: PathBuf,
}

impl Scratch {
    fn new(name: &str) -> Self {
        let path = std::env::temp_dir().join(format!(
            "deskstart-migrations-{name}-{}.sqlite3",
            uuid::Uuid::now_v7()
        ));
        Self { path }
    }

    fn open(&self) -> Connection {
        let conn = Connection::open(&self.path).expect("open");
        conn.pragma_update(None, "journal_mode", "WAL").unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        conn
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
        let _ = fs::remove_file(self.path.with_extension("sqlite3-wal"));
        let _ = fs::remove_file(self.path.with_extension("sqlite3-shm"));
    }
}

fn count(conn: &Connection, sql: &str) -> i64 {
    conn.query_row(sql, [], |r| r.get(0)).unwrap_or(-1)
}

/// Apply migrations one at a time, up to and including `version`, the way the
/// runner would have at that point in the product's history.
fn migrate_to(conn: &Connection, version: i64) {
    for (index, (name, sql)) in migrations::sources().iter().enumerate() {
        let this = index as i64 + 1;
        if this > version || this <= migrations::current_version(conn) {
            continue;
        }
        conn.execute_batch(&format!(
            "BEGIN; {sql} UPDATE workspace SET schema_version = {this} WHERE id = 1; COMMIT;"
        ))
        .unwrap_or_else(|error| panic!("migration {name} failed: {error}"));
    }
}

#[test]
fn a_workspace_written_at_every_version_survives_the_walk_to_head() {
    let scratch = Scratch::new("walk");
    let conn = scratch.open();
    let head = migrations::target_version();
    assert!(head >= 2, "this test walks at least two versions");

    // ── Version 1: the foundation. A profile, an app step, a run with its log.
    migrate_to(&conn, 1);
    conn.execute_batch(
        r#"INSERT INTO profile (id, name, position, created_at, updated_at)
             VALUES ('p1', 'Morning', 0, 't', 't');
           INSERT INTO step (id, profile_id, position, kind, config_json, timing_json, created_at, updated_at)
             VALUES ('s1', 'p1', 0, 'app', '{"program":"C:\\a.exe","args":[],"workingDir":null}', '{}', 't', 't');
           INSERT INTO run (id, profile_id, profile_name, mode, trigger, started_at, finished_at, outcome)
             VALUES ('r1', 'p1', 'Morning', 'real', 'button', 't', 't', 'completed');
           INSERT INTO event (run_id, seq, at, step_id, kind, payload_json)
             VALUES ('r1', 1, 't', NULL, 'run_started', '{}'),
                    ('r1', 2, 't', 's1', 'spawned', '{"pid":1}'),
                    ('r1', 3, 't', NULL, 'run_finished', '{"outcome":"completed"}');"#,
    )
    .expect("write at version 1");
    // Only app steps exist at version 1.
    assert!(conn
        .execute(
            "INSERT INTO step (id, profile_id, position, kind, config_json, timing_json, created_at, updated_at)
             VALUES ('s-url', 'p1', 1, 'url', '{}', '{}', 't', 't')",
            [],
        )
        .is_err());

    // ── To head.
    migrate_to(&conn, head);
    migrations::apply(&conn).expect("head is idempotent");
    assert_eq!(migrations::current_version(&conn), head);

    // Everything written along the way is still there.
    assert_eq!(count(&conn, "SELECT count(*) FROM profile"), 1);
    assert_eq!(
        count(
            &conn,
            "SELECT count(*) FROM step WHERE id = 's1' AND kind = 'app'"
        ),
        1
    );
    let config: String = conn
        .query_row("SELECT config_json FROM step WHERE id = 's1'", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert!(config.contains("a.exe"));
    assert_eq!(
        count(&conn, "SELECT count(*) FROM event WHERE run_id = 'r1'"),
        3
    );

    // ── Version 2 admits the new kinds and still refuses an unknown one.
    for (id, kind) in [("s2", "folder"), ("s3", "file"), ("s4", "url")] {
        conn.execute(
            "INSERT INTO step (id, profile_id, position, kind, config_json, timing_json, created_at, updated_at)
             VALUES (?1, 'p1', 9, ?2, '{}', '{}', 't', 't')",
            [id, kind],
        )
        .unwrap_or_else(|e| panic!("{kind} must be accepted at head: {e}"));
    }
    assert!(conn
        .execute(
            "INSERT INTO step (id, profile_id, position, kind, config_json, timing_json, created_at, updated_at)
             VALUES ('s5', 'p1', 9, 'shortcut', '{}', '{}', 't', 't')",
            [],
        )
        .is_err());

    // The rebuilt table kept its foreign key: deleting the profile takes the steps.
    conn.execute("DELETE FROM profile WHERE id = 'p1'", [])
        .unwrap();
    assert_eq!(count(&conn, "SELECT count(*) FROM step"), 0);
    // And the log survived the profile, with its name.
    assert_eq!(
        count(
            &conn,
            "SELECT count(*) FROM run WHERE profile_name = 'Morning'"
        ),
        1
    );
    assert_eq!(count(&conn, "SELECT count(*) FROM event"), 3);
}

#[test]
fn a_fresh_workspace_reaches_head_in_one_apply() {
    let scratch = Scratch::new("fresh");
    let conn = scratch.open();
    migrations::apply(&conn).expect("migrate");
    assert_eq!(
        migrations::current_version(&conn),
        migrations::target_version()
    );
    assert_eq!(
        count(
            &conn,
            "SELECT count(*) FROM sqlite_master WHERE name = 'idx_step_profile'"
        ),
        1
    );
}

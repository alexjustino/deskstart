//! The claim the first slice actually makes: what you wrote — and what the
//! run log recorded — is still there after the process is gone.
//!
//! Every other repository test runs against an in-memory database, which is
//! fast and proves the logic — and proves nothing at all about durability. A
//! transaction that was never really committed, a journal mode that loses the
//! last write, a trigger created on a connection rather than in the file: none
//! of those show up in memory. They show up when a person closes the
//! application and opens it again.
//!
//! So this test uses a real file, drops the connection, and opens it again.

use std::fs;
use std::path::PathBuf;

use deskstart_lib::db::{self, profiles, runs};
use rusqlite::Connection;

/// A scratch database that removes itself, whatever the test does.
struct Scratch {
    path: PathBuf,
}

impl Scratch {
    fn new(name: &str) -> Self {
        let path = std::env::temp_dir().join(format!(
            "deskstart-test-{name}-{}.sqlite3",
            uuid::Uuid::now_v7()
        ));
        Self { path }
    }

    /// Open the workspace the way the application does.
    fn open(&self) -> Connection {
        db::open_at(&self.path).expect("open the workspace")
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
        let _ = fs::remove_file(self.path.with_extension("sqlite3-wal"));
        let _ = fs::remove_file(self.path.with_extension("sqlite3-shm"));
    }
}

#[test]
fn what_you_wrote_and_what_ran_are_still_there_after_a_restart() {
    let scratch = Scratch::new("restart");

    // ── First run ───────────────────────────────────────────────────────────
    let (profile_id, run_id) = {
        let mut conn = scratch.open();
        let profile = profiles::create_profile(&conn, "Morning").unwrap();
        profiles::add_step(
            &conn,
            &profile.id,
            "app",
            r#"{"program":"C:\\Windows\\System32\\notepad.exe","args":[],"workingDir":null}"#,
            r#"{"holdMs":5000}"#,
        )
        .unwrap();
        let run = runs::create_run(&mut conn, &profile, "real", "button", 1).unwrap();
        runs::append_event(
            &mut conn,
            &run.id,
            None,
            "spawned",
            &serde_json::json!({ "pid": 1234 }),
        )
        .unwrap();
        runs::finish_run(&mut conn, &run.id, "completed").unwrap();
        (profile.id, run.id)
    };

    // ── Second run: a new connection to the same file ───────────────────────
    let conn = scratch.open();
    let profile = profiles::get_profile(&conn, &profile_id).expect("the profile survived");
    assert_eq!(profile.name, "Morning");
    assert_eq!(profiles::list_steps(&conn, &profile_id).unwrap().len(), 1);

    let run = runs::get_run(&conn, &run_id).expect("the run survived");
    assert_eq!(run.outcome.as_deref(), Some("completed"));
    let kinds: Vec<String> = runs::list_events(&conn, &run_id)
        .unwrap()
        .into_iter()
        .map(|e| e.kind)
        .collect();
    assert_eq!(kinds, ["run_started", "spawned", "run_finished"]);

    // The append-only promise lives in the file, not in a connection.
    let forged = conn.execute(
        "UPDATE event SET payload_json = '{}' WHERE run_id = ?1",
        [&run_id],
    );
    assert!(
        forged.is_err(),
        "the log must refuse rewriting after a reopen"
    );
}

#[test]
fn the_file_is_in_wal_mode() {
    let scratch = Scratch::new("wal");
    let conn = scratch.open();
    let mode: String = conn
        .query_row("PRAGMA journal_mode", [], |r| r.get(0))
        .unwrap();
    assert_eq!(mode.to_lowercase(), "wal");
}

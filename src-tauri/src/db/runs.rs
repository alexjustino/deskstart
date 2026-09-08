//! Runs and the run log.
//!
//! The log is the source of truth of what happened (ADR-011). Everything here
//! appends; nothing here updates or deletes an event, and the schema's triggers
//! make sure nothing else does either. `seq` orders events within a run without
//! trusting the clock, which can jump on a laptop that slept.

use rusqlite::{params, Connection, OptionalExtension};

use crate::db::models::{Event, Profile, Run};
use crate::db::{new_id, now};
use crate::error::{Error, Result};

const RUN_COLUMNS: &str =
    "id, profile_id, profile_name, mode, trigger, started_at, finished_at, outcome";
const EVENT_COLUMNS: &str = "id, run_id, seq, at, step_id, kind, payload_json";

pub const MODES: [&str; 2] = ["real", "dry"];
pub const TRIGGERS: [&str; 4] = ["button", "shortcut", "schedule", "command"];
pub const OUTCOMES: [&str; 4] = ["completed", "completed_with_failures", "failed", "stopped"];

fn read_run(row: &rusqlite::Row<'_>) -> rusqlite::Result<Run> {
    Ok(Run {
        id: row.get(0)?,
        profile_id: row.get(1)?,
        profile_name: row.get(2)?,
        mode: row.get(3)?,
        trigger: row.get(4)?,
        started_at: row.get(5)?,
        finished_at: row.get(6)?,
        outcome: row.get(7)?,
    })
}

fn read_event(row: &rusqlite::Row<'_>) -> rusqlite::Result<Event> {
    Ok(Event {
        id: row.get(0)?,
        run_id: row.get(1)?,
        seq: row.get(2)?,
        at: row.get(3)?,
        step_id: row.get(4)?,
        kind: row.get(5)?,
        payload_json: row.get(6)?,
    })
}

pub fn get_run(conn: &Connection, id: &str) -> Result<Run> {
    conn.query_row(
        &format!("SELECT {RUN_COLUMNS} FROM run WHERE id = ?1"),
        [id],
        read_run,
    )
    .optional()?
    .ok_or(Error::NotFound)
}

/// Begin a run: the row and its first event, in one transaction, so a run can
/// never exist without the line that says it started.
pub fn create_run(
    conn: &mut Connection,
    profile: &Profile,
    mode: &str,
    trigger: &str,
    step_count: usize,
) -> Result<Run> {
    if !MODES.contains(&mode) {
        return Err(Error::InvalidInput("that run mode does not exist"));
    }
    if !TRIGGERS.contains(&trigger) {
        return Err(Error::InvalidInput("that trigger does not exist"));
    }
    let id = new_id();
    let stamp = now();
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO run (id, profile_id, profile_name, mode, trigger, started_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, profile.id, profile.name, mode, trigger, stamp],
    )?;
    let payload = serde_json::json!({
        "profileName": profile.name,
        "mode": mode,
        "trigger": trigger,
        "steps": step_count,
    });
    insert_event(&tx, &id, None, "run_started", &payload)?;
    tx.commit()?;
    get_run(conn, &id)
}

/// Append one line to a run's log. Refused once the run has finished: a
/// finished run is history, and history does not grow.
pub fn append_event(
    conn: &mut Connection,
    run_id: &str,
    step_id: Option<&str>,
    kind: &str,
    payload: &serde_json::Value,
) -> Result<Event> {
    let run = get_run(conn, run_id)?;
    if run.finished_at.is_some() {
        return Err(Error::InvalidInput("this run has already finished"));
    }
    let tx = conn.transaction()?;
    let seq = insert_event(&tx, run_id, step_id, kind, payload)?;
    tx.commit()?;
    conn.query_row(
        &format!("SELECT {EVENT_COLUMNS} FROM event WHERE run_id = ?1 AND seq = ?2"),
        params![run_id, seq],
        read_event,
    )
    .map_err(Error::from)
}

fn insert_event(
    tx: &rusqlite::Transaction<'_>,
    run_id: &str,
    step_id: Option<&str>,
    kind: &str,
    payload: &serde_json::Value,
) -> Result<i64> {
    let seq: i64 = tx.query_row(
        "SELECT coalesce(max(seq), 0) + 1 FROM event WHERE run_id = ?1",
        [run_id],
        |r| r.get(0),
    )?;
    tx.execute(
        "INSERT INTO event (run_id, seq, at, step_id, kind, payload_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![run_id, seq, now(), step_id, kind, payload.to_string()],
    )?;
    Ok(seq)
}

/// Close a run with its outcome: the last event and the row, together.
pub fn finish_run(conn: &mut Connection, run_id: &str, outcome: &str) -> Result<Run> {
    if !OUTCOMES.contains(&outcome) {
        return Err(Error::InvalidInput("that outcome does not exist"));
    }
    let run = get_run(conn, run_id)?;
    if run.finished_at.is_some() {
        return Err(Error::InvalidInput("this run has already finished"));
    }
    let stamp = now();
    let tx = conn.transaction()?;
    insert_event(
        &tx,
        run_id,
        None,
        "run_finished",
        &serde_json::json!({ "outcome": outcome }),
    )?;
    tx.execute(
        "UPDATE run SET finished_at = ?2, outcome = ?3 WHERE id = ?1",
        params![run_id, stamp, outcome],
    )?;
    tx.commit()?;
    get_run(conn, run_id)
}

/// Runs, newest first; for one profile when asked.
pub fn list_runs(conn: &Connection, profile_id: Option<&str>, limit: i64) -> Result<Vec<Run>> {
    let limit = limit.clamp(1, 1_000);
    let mut statement = conn.prepare(&format!(
        "SELECT {RUN_COLUMNS} FROM run
         WHERE (?1 IS NULL OR profile_id = ?1)
         ORDER BY started_at DESC, id DESC LIMIT ?2"
    ))?;
    let rows = statement.query_map(params![profile_id, limit], read_run)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn list_events(conn: &Connection, run_id: &str) -> Result<Vec<Event>> {
    let mut statement = conn.prepare(&format!(
        "SELECT {EVENT_COLUMNS} FROM event WHERE run_id = ?1 ORDER BY seq"
    ))?;
    let rows = statement.query_map([run_id], read_event)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations;
    use crate::db::profiles;

    fn memory() -> Connection {
        let conn = Connection::open_in_memory().expect("in-memory database");
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations::apply(&conn).unwrap();
        conn
    }

    #[test]
    fn a_run_begins_with_its_first_line_and_ends_with_its_last() {
        let mut conn = memory();
        let profile = profiles::create_profile(&conn, "Morning").unwrap();
        let run = create_run(&mut conn, &profile, "real", "button", 1).unwrap();
        assert!(run.finished_at.is_none());

        let spawned = append_event(
            &mut conn,
            &run.id,
            Some("s1"),
            "spawned",
            &serde_json::json!({ "pid": 4242 }),
        )
        .unwrap();
        assert_eq!(spawned.seq, 2, "run_started took seq 1");

        let finished = finish_run(&mut conn, &run.id, "completed").unwrap();
        assert_eq!(finished.outcome.as_deref(), Some("completed"));
        assert!(finished.finished_at.is_some());

        let kinds: Vec<String> = list_events(&conn, &run.id)
            .unwrap()
            .into_iter()
            .map(|e| e.kind)
            .collect();
        assert_eq!(kinds, ["run_started", "spawned", "run_finished"]);
    }

    #[test]
    fn a_finished_run_takes_no_more_lines() {
        let mut conn = memory();
        let profile = profiles::create_profile(&conn, "Morning").unwrap();
        let run = create_run(&mut conn, &profile, "dry", "button", 0).unwrap();
        finish_run(&mut conn, &run.id, "completed").unwrap();

        let late = append_event(&mut conn, &run.id, None, "spawned", &serde_json::json!({}));
        assert!(matches!(late, Err(Error::InvalidInput(_))));
        let twice = finish_run(&mut conn, &run.id, "stopped");
        assert!(matches!(twice, Err(Error::InvalidInput(_))));
    }

    #[test]
    fn an_unknown_mode_trigger_or_outcome_is_refused() {
        let mut conn = memory();
        let profile = profiles::create_profile(&conn, "Morning").unwrap();
        assert!(matches!(
            create_run(&mut conn, &profile, "maybe", "button", 0),
            Err(Error::InvalidInput(_))
        ));
        assert!(matches!(
            create_run(&mut conn, &profile, "real", "telepathy", 0),
            Err(Error::InvalidInput(_))
        ));
        let run = create_run(&mut conn, &profile, "real", "button", 0).unwrap();
        assert!(matches!(
            finish_run(&mut conn, &run.id, "fine"),
            Err(Error::InvalidInput(_))
        ));
    }

    #[test]
    fn a_run_outlives_its_profile_and_keeps_the_name() {
        let mut conn = memory();
        let profile = profiles::create_profile(&conn, "Morning").unwrap();
        let run = create_run(&mut conn, &profile, "real", "button", 0).unwrap();
        finish_run(&mut conn, &run.id, "completed").unwrap();

        profiles::delete_profile(&conn, &profile.id).unwrap();

        let runs = list_runs(&conn, None, 10).unwrap();
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].profile_name, "Morning");
        assert_eq!(runs[0].profile_id, None);
        assert_eq!(list_events(&conn, &run.id).unwrap().len(), 2);
    }

    #[test]
    fn runs_list_newest_first_and_filter_by_profile() {
        let mut conn = memory();
        let a = profiles::create_profile(&conn, "A").unwrap();
        let b = profiles::create_profile(&conn, "B").unwrap();
        let first = create_run(&mut conn, &a, "real", "button", 0).unwrap();
        let second = create_run(&mut conn, &b, "real", "button", 0).unwrap();
        let third = create_run(&mut conn, &a, "real", "button", 0).unwrap();

        let all: Vec<String> = list_runs(&conn, None, 10)
            .unwrap()
            .into_iter()
            .map(|r| r.id)
            .collect();
        assert_eq!(all, [third.id.clone(), second.id.clone(), first.id.clone()]);
        let only_a: Vec<String> = list_runs(&conn, Some(&a.id), 10)
            .unwrap()
            .into_iter()
            .map(|r| r.id)
            .collect();
        assert_eq!(only_a, [third.id, first.id]);
    }
}

//! Run commands: the host's half of the execution loop (ADR-011, ADR-012).
//!
//! The domain decides what happens next and asks for one action at a time;
//! each command here performs one action and appends what happened to the run
//! log before returning it. The interface never learns of an outcome that the
//! log does not already hold.
//!
//! Processes the host starts are **held** — the `Child` handle kept in `Held`
//! under (run, step) — for as long as the run lasts, so a hold can end with a
//! close (F2) and a stop can reach them (F3). Dropping a handle never ends a
//! process; only `step_close` does, and it says how.

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Child;
use std::sync::Mutex;
use std::time::Duration;

use tauri::State;

use crate::db::models::{Event, Launch, Run};
use crate::db::{profiles, runs, Db};
use crate::error::{Error, Result};
use crate::os::{close, open, process};

/// The processes started by runs that have not finished, by (run, step).
#[derive(Default)]
pub struct Held(pub Mutex<HashMap<(String, String), Child>>);

/// How long a program gets to close itself before it is terminated.
const CLOSE_GRACE: Duration = Duration::from_secs(3);

/// Begin a run of a profile. Refused for a profile that was imported and not
/// yet reviewed (ADR-013): the review gate lives here as well as in the domain.
#[tauri::command]
pub fn run_begin(
    db: State<'_, Db>,
    profile_id: String,
    mode: String,
    trigger: String,
) -> Result<Run> {
    let mut conn = db.0.lock().expect("the database lock was poisoned");
    let profile = profiles::get_profile(&conn, &profile_id)?;
    if profile.imported_unreviewed {
        return Err(Error::Unreviewed);
    }
    let steps = profiles::list_steps(&conn, &profile_id)?;
    runs::create_run(&mut conn, &profile, &mode, &trigger, steps.len())
}

/// Execute one step of a run and record what happened.
///
/// The domain resolved the stored step into `launch` — every path absolute,
/// the source kept when expansion changed it. The host checks the launch is
/// of the stored step's kind, then acts. In a dry run nothing is started: the
/// line says what would have been. In a real run a failure becomes a `failed`
/// line with its reason, never an error — the profile continues past it.
#[tauri::command]
pub fn step_execute(
    db: State<'_, Db>,
    held: State<'_, Held>,
    run_id: String,
    step_id: String,
    launch: Launch,
) -> Result<Event> {
    let mut conn = db.0.lock().expect("the database lock was poisoned");
    let run = runs::get_run(&conn, &run_id)?;
    if run.finished_at.is_some() {
        return Err(Error::InvalidInput("this run has already finished"));
    }
    let step = profiles::get_step(&conn, &step_id)?;
    if step.kind != launch.kind() {
        return Err(Error::InvalidInput(
            "the launch is not of the stored step's kind",
        ));
    }

    let mut payload = launch.describe();

    if run.mode == "dry" {
        let kind = match launch {
            Launch::App { .. } => "would_spawn",
            _ => "would_open",
        };
        return runs::append_event(&mut conn, &run_id, Some(&step_id), kind, &payload);
    }

    let outcome: std::result::Result<(&str, Option<u32>), process::LaunchFailure> = match &launch {
        Launch::App {
            program,
            args,
            working_dir,
            ..
        } => process::spawn(&process::Launch {
            program: PathBuf::from(program),
            args: args.clone(),
            working_dir: working_dir.as_ref().map(PathBuf::from),
        })
        .map(|spawned| {
            // Held for the life of the run: a hold ends with a close, and a
            // stop must be able to reach it.
            held.0
                .lock()
                .expect("the held lock was poisoned")
                .insert((run_id.clone(), step_id.clone()), spawned.child);
            ("spawned", Some(spawned.pid))
        }),
        Launch::Folder { path, .. } => {
            open::folder(&PathBuf::from(path)).map(|opened| ("opened", opened.pid))
        }
        Launch::File { path, .. } => {
            open::file(&PathBuf::from(path)).map(|opened| ("opened", opened.pid))
        }
        Launch::Url { url, .. } => open::url(url).map(|opened| ("opened", opened.pid)),
    };

    match outcome {
        Ok((kind, pid)) => {
            payload["pid"] = serde_json::json!(pid);
            runs::append_event(&mut conn, &run_id, Some(&step_id), kind, &payload)
        }
        Err(failure) => {
            payload["reason"] = serde_json::json!(failure.reason());
            runs::append_event(&mut conn, &run_id, Some(&step_id), "failed", &payload)
        }
    }
}

/// Close the program a step started, its hold being over.
///
/// The windows are asked first and the process terminated only after a grace
/// (`os::close`). A process that had already exited — a stub that handed off —
/// is a `not_closed` line with that reason; nothing else is touched. In a dry
/// run the line says what would have been closed and after how long.
#[tauri::command]
pub fn step_close(
    db: State<'_, Db>,
    held: State<'_, Held>,
    run_id: String,
    step_id: String,
    launch: Launch,
    held_ms: i64,
) -> Result<Event> {
    let mut conn = db.0.lock().expect("the database lock was poisoned");
    let run = runs::get_run(&conn, &run_id)?;
    if run.finished_at.is_some() {
        return Err(Error::InvalidInput("this run has already finished"));
    }
    let mut payload = launch.describe();
    payload["heldMs"] = serde_json::json!(held_ms);

    if run.mode == "dry" {
        return runs::append_event(&mut conn, &run_id, Some(&step_id), "would_close", &payload);
    }

    let child = held
        .0
        .lock()
        .expect("the held lock was poisoned")
        .remove(&(run_id.clone(), step_id.clone()));
    let Some(mut child) = child else {
        payload["reason"] =
            serde_json::json!("the run holds no process for this step; nothing to close");
        return runs::append_event(&mut conn, &run_id, Some(&step_id), "not_closed", &payload);
    };
    payload["pid"] = serde_json::json!(child.id());

    match close::close(&mut child, CLOSE_GRACE) {
        Ok(closed) => {
            payload["how"] = serde_json::json!(match closed.how {
                close::How::Window => "window",
                close::How::Terminated => "terminated",
            });
            runs::append_event(&mut conn, &run_id, Some(&step_id), "closed", &payload)
        }
        Err(failure) => {
            payload["reason"] = serde_json::json!(failure.reason());
            runs::append_event(&mut conn, &run_id, Some(&step_id), "not_closed", &payload)
        }
    }
}

/// Record a pause the run observed (or, dry, would have): the line that keeps
/// a gap in the timestamps from looking like a stall.
#[tauri::command]
pub fn step_wait(db: State<'_, Db>, run_id: String, step_id: String, ms: i64) -> Result<Event> {
    let mut conn = db.0.lock().expect("the database lock was poisoned");
    let run = runs::get_run(&conn, &run_id)?;
    if run.finished_at.is_some() {
        return Err(Error::InvalidInput("this run has already finished"));
    }
    if ms < 0 {
        return Err(Error::InvalidInput("a wait cannot be negative"));
    }
    let kind = if run.mode == "dry" {
        "would_wait"
    } else {
        "waited"
    };
    runs::append_event(
        &mut conn,
        &run_id,
        Some(&step_id),
        kind,
        &serde_json::json!({ "ms": ms }),
    )
}

/// Close the run with its outcome. The handles it held are released — not
/// closed: a program the run left open stays open, and only a hold or a stop
/// ends a program.
#[tauri::command]
pub fn run_finish(
    db: State<'_, Db>,
    held: State<'_, Held>,
    run_id: String,
    outcome: String,
) -> Result<Run> {
    let mut conn = db.0.lock().expect("the database lock was poisoned");
    let run = runs::finish_run(&mut conn, &run_id, &outcome)?;
    held.0
        .lock()
        .expect("the held lock was poisoned")
        .retain(|(held_run, _), _| held_run != &run_id);
    Ok(run)
}

#[tauri::command]
pub fn runs_list(
    db: State<'_, Db>,
    profile_id: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<Run>> {
    let conn = db.0.lock().expect("the database lock was poisoned");
    runs::list_runs(&conn, profile_id.as_deref(), limit.unwrap_or(50))
}

#[tauri::command]
pub fn events_list(db: State<'_, Db>, run_id: String) -> Result<Vec<Event>> {
    let conn = db.0.lock().expect("the database lock was poisoned");
    runs::list_events(&conn, &run_id)
}

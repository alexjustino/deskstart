//! Run commands: the host's half of the execution loop (ADR-011, ADR-012).
//!
//! The domain decides what happens next and asks for one action at a time;
//! each command here performs one action and appends what happened to the run
//! log before returning it. The interface never learns of an outcome that the
//! log does not already hold.

use std::path::PathBuf;

use tauri::State;

use crate::db::models::{Event, Launch, Run};
use crate::db::{profiles, runs, Db};
use crate::error::{Error, Result};
use crate::os::{open, process};

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
            // F1 keeps nothing after the PID. F3 (Stop) holds the handle in a
            // Job Object for the life of the run.
            drop(spawned.child);
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

#[tauri::command]
pub fn run_finish(db: State<'_, Db>, run_id: String, outcome: String) -> Result<Run> {
    let mut conn = db.0.lock().expect("the database lock was poisoned");
    runs::finish_run(&mut conn, &run_id, &outcome)
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

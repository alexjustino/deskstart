//! Run commands: the host's half of the execution loop (ADR-011, ADR-012).
//!
//! The domain decides what happens next and asks for one action at a time;
//! each command here performs one action and appends what happened to the run
//! log before returning it. The interface never learns of an outcome that the
//! log does not already hold.
//!
//! Processes the host starts are **held** — the `Child` handle kept under the
//! run, and the process put in the run's Job Object — for as long as the run
//! lasts, so a hold can end with a close (F2) and a Stop can reach everything
//! (F3, ADR-015). Dropping a handle or closing the job never ends a process;
//! only `step_close` and `run_stop` do, and they say how.

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Child;
use std::sync::Mutex;
use std::time::Duration;

use tauri::State;

use crate::db::models::{Event, Launch, Run};
use crate::db::{profiles, runs, Db};
use crate::error::{Error, Result};
use crate::os::{close, job, open, probe, process, tools, window};

/// What the host holds for one run that has not finished.
#[derive(Default)]
pub struct RunHold {
    /// The net under everything the run started. None when Windows refused
    /// one, which the log records at the start of the run.
    pub job: Option<job::Job>,
    /// The processes started for each step, by step id.
    pub children: HashMap<String, Child>,
}

/// The runs in progress, by run id.
#[derive(Default)]
pub struct Held(pub Mutex<HashMap<String, RunHold>>);

/// How long a program gets to close itself before it is terminated.
const CLOSE_GRACE: Duration = Duration::from_secs(3);

/// How long the host looks for the window it was asked to place (F6). A window
/// is not there the instant the process is; five seconds is long enough for a
/// program that shows one and short enough that a program that never will does
/// not hold the profile up.
const WINDOW_TIMEOUT: Duration = Duration::from_secs(5);

/// How long a hypervisor's tool gets to start a machine and answer (F8). A
/// machine that takes longer to *boot* is not held up by this — the tool
/// returns once the start is under way; a tool that does not return in a
/// minute is ended, and that is the reason in the log.
const COMMAND_BUDGET: Duration = Duration::from_secs(60);

/// Begin a run of a profile. Refused for a profile that was imported and not
/// yet reviewed (ADR-013): the review gate lives here as well as in the domain.
#[tauri::command]
pub fn run_begin(
    db: State<'_, Db>,
    held: State<'_, Held>,
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
    let run = runs::create_run(&mut conn, &profile, &mode, &trigger, steps.len())?;

    if run.mode == "real" {
        let job = match job::Job::create() {
            Ok(job) => Some(job),
            Err(failure) => {
                // Said, not hidden: without a job a Stop reaches only the
                // processes the host holds handles of.
                log::warn!("no job object for run {}: {}", run.id, failure.0);
                runs::append_event(
                    &mut conn,
                    &run.id,
                    None,
                    "no_job",
                    &serde_json::json!({ "reason": failure.0 }),
                )?;
                None
            }
        };
        held.0.lock().expect("the held lock was poisoned").insert(
            run.id.clone(),
            RunHold {
                job,
                children: HashMap::new(),
            },
        );
    }
    Ok(run)
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
            env: Vec::new(),
        })
        .map(|spawned| {
            // Held for the life of the run, and put in its job: a hold ends
            // with a close, and a Stop must be able to reach it.
            let mut held = held.0.lock().expect("the held lock was poisoned");
            let hold = held.entry(run_id.clone()).or_default();
            if let Some(job) = &hold.job {
                if let Err(failure) = job.assign(&spawned.child) {
                    log::warn!(
                        "pid {} not assigned to the run's job: {}",
                        spawned.pid,
                        failure.0
                    );
                    payload["inJob"] = serde_json::json!(false);
                }
            }
            hold.children.insert(step_id.clone(), spawned.child);
            ("spawned", Some(spawned.pid))
        }),
        Launch::Folder { path, .. } => {
            open::folder(&PathBuf::from(path)).map(|opened| ("opened", opened.pid))
        }
        Launch::File { path, .. } => {
            open::file(&PathBuf::from(path)).map(|opened| ("opened", opened.pid))
        }
        Launch::Url { url, .. } => open::url(url).map(|opened| ("opened", opened.pid)),
        Launch::Tool { tool, args, .. } => match tools::invocation(tool, args) {
            None => Err(process::LaunchFailure::ToolMissing(tools::name_of(tool))),
            // A hypervisor's tool does one thing, says whether it could, and
            // exits: it is waited for, within a budget, and what it said is
            // the reason (F8, ADR-023). The console it opened is the
            // hypervisor's, not a process this run holds.
            Some(invocation) if tools::mode(tool) == tools::Mode::Command => {
                process::run_bounded(&invocation, COMMAND_BUDGET).map(|finished| {
                    if !finished.said.is_empty() {
                        payload["said"] = serde_json::json!(finished.said);
                    }
                    ("opened", None)
                })
            }
            Some(invocation) => process::spawn(&invocation).map(|spawned| {
                // Held and put in the run's job like any other program this
                // product starts: what a Stop reaches is what the run opened,
                // whatever it was opened with (ADR-015).
                let mut held = held.0.lock().expect("the held lock was poisoned");
                let hold = held.entry(run_id.clone()).or_default();
                if let Some(job) = &hold.job {
                    if let Err(failure) = job.assign(&spawned.child) {
                        log::warn!(
                            "pid {} not assigned to the run's job: {}",
                            spawned.pid,
                            failure.0
                        );
                        payload["inJob"] = serde_json::json!(false);
                    }
                }
                hold.children.insert(step_id.clone(), spawned.child);
                ("opened", Some(spawned.pid))
            }),
        },
        // The loop resolves a bookmark folder into pages before it asks for
        // anything to be opened; arriving here means it did not.
        Launch::Bookmarks { .. } => {
            return Err(Error::InvalidInput(
                "a bookmark folder must be read before it can be opened",
            ))
        }
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
        .get_mut(&run_id)
        .and_then(|hold| hold.children.remove(&step_id));
    let Some(mut child) = child else {
        payload["reason"] =
            serde_json::json!("the run holds no process for this step; nothing to close");
        return runs::append_event(&mut conn, &run_id, Some(&step_id), "not_closed", &payload);
    };
    payload["pid"] = serde_json::json!(child.id());

    match close::close(&mut child, CLOSE_GRACE) {
        Ok(closed) => {
            payload["how"] = serde_json::json!(how_name(closed.how));
            runs::append_event(&mut conn, &run_id, Some(&step_id), "closed", &payload)
        }
        Err(failure) => {
            payload["reason"] = serde_json::json!(failure.reason());
            runs::append_event(&mut conn, &run_id, Some(&step_id), "not_closed", &payload)
        }
    }
}

fn how_name(how: close::How) -> &'static str {
    match how {
        close::How::Window => "window",
        close::How::Terminated => "terminated",
    }
}

/// What a step waits for, as the domain resolved it.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Probe {
    /// The process the awaited step started has a visible window of its own.
    Window,
    /// Something answers on this machine's TCP port.
    Port { port: u16 },
}

impl Probe {
    fn describe(&self) -> String {
        match self {
            Probe::Window => "a window".into(),
            Probe::Port { port } => format!("port {port}"),
        }
    }
}

/// Ask whether what a step waits for is responding.
///
/// This writes **no** line: it is asked four times a second while a step
/// waits, and a log with four lines a second is not a log. What reaches the
/// log is the beginning of the wait, its end, and nothing in between.
#[tauri::command]
pub fn step_probe(
    held: State<'_, Held>,
    run_id: String,
    awaited_step_id: String,
    probe: Probe,
) -> Result<bool> {
    Ok(match probe {
        Probe::Window => {
            let held = held.0.lock().expect("the held lock was poisoned");
            match held
                .get(&run_id)
                .and_then(|hold| hold.children.get(&awaited_step_id))
            {
                // The run does not hold a process for that step — it opened a
                // folder, or the process is gone. Neither will grow a window.
                None => false,
                Some(child) => probe::has_window(child.id()),
            }
        }
        Probe::Port { port } => probe::port_answers(port),
    })
}

/// The line that opens a wait: what this step waits for, and for how long.
#[tauri::command]
pub fn step_waiting_for(
    db: State<'_, Db>,
    run_id: String,
    step_id: String,
    awaited_step_id: String,
    probe: Probe,
    timeout_ms: i64,
) -> Result<Event> {
    let mut conn = db.0.lock().expect("the database lock was poisoned");
    let run = runs::get_run(&conn, &run_id)?;
    let payload = serde_json::json!({
        "awaitedStepId": awaited_step_id,
        "probe": probe.describe(),
        "timeoutMs": timeout_ms,
    });
    let kind = if run.mode == "dry" {
        "would_wait_for"
    } else {
        "waiting_for"
    };
    runs::append_event(&mut conn, &run_id, Some(&step_id), kind, &payload)
}

/// The line that closes a wait: it answered, after this long.
#[tauri::command]
pub fn step_ready(
    db: State<'_, Db>,
    run_id: String,
    step_id: String,
    waited_ms: i64,
) -> Result<Event> {
    let mut conn = db.0.lock().expect("the database lock was poisoned");
    runs::append_event(
        &mut conn,
        &run_id,
        Some(&step_id),
        "ready",
        &serde_json::json!({ "waitedMs": waited_ms }),
    )
}

/// The line for a step that will not start, and why. The run carries on.
#[tauri::command]
pub fn step_skipped(
    db: State<'_, Db>,
    run_id: String,
    step_id: String,
    reason: String,
) -> Result<Event> {
    let mut conn = db.0.lock().expect("the database lock was poisoned");
    runs::append_event(
        &mut conn,
        &run_id,
        Some(&step_id),
        "skipped",
        &serde_json::json!({ "reason": reason }),
    )
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

/// Stop a run: close everything it opened, and only that (ADR-015).
///
/// Every process the run still holds is asked to close and given its grace,
/// one line each — `closed` or `not_closed` with the reason. Then the run's
/// job is terminated, which reaches whatever those processes started in turn.
/// A process the run did not start — one the shell opened on its behalf, one
/// a person opened — is never touched. `launches` names each step so the lines
/// can say what was closed.
#[tauri::command]
pub fn run_stop(
    db: State<'_, Db>,
    held: State<'_, Held>,
    run_id: String,
    launches: HashMap<String, Launch>,
) -> Result<Vec<Event>> {
    let mut conn = db.0.lock().expect("the database lock was poisoned");
    let run = runs::get_run(&conn, &run_id)?;
    if run.finished_at.is_some() {
        return Err(Error::InvalidInput("this run has already finished"));
    }
    let mut lines = Vec::new();
    if run.mode == "dry" {
        lines.push(runs::append_event(
            &mut conn,
            &run_id,
            None,
            "stopped",
            &serde_json::json!({ "closed": 0, "notClosed": 0, "swept": false }),
        )?);
        return Ok(lines);
    }

    let hold = held
        .0
        .lock()
        .expect("the held lock was poisoned")
        .remove(&run_id);
    let Some(mut hold) = hold else {
        lines.push(runs::append_event(
            &mut conn,
            &run_id,
            None,
            "stopped",
            &serde_json::json!({ "closed": 0, "notClosed": 0, "swept": false }),
        )?);
        return Ok(lines);
    };

    let mut closed = 0;
    let mut not_closed = 0;
    let mut children: Vec<(String, Child)> = hold.children.drain().collect();
    children.sort_by(|a, b| a.0.cmp(&b.0));
    for (step_id, mut child) in children {
        let mut payload = launches
            .get(&step_id)
            .map(Launch::describe)
            .unwrap_or_else(|| serde_json::json!({}));
        payload["stop"] = serde_json::json!(true);
        payload["pid"] = serde_json::json!(child.id());
        let line = match close::close(&mut child, CLOSE_GRACE) {
            Ok(done) => {
                closed += 1;
                payload["how"] = serde_json::json!(how_name(done.how));
                runs::append_event(&mut conn, &run_id, Some(&step_id), "closed", &payload)?
            }
            Err(failure) => {
                not_closed += 1;
                payload["reason"] = serde_json::json!(failure.reason());
                runs::append_event(&mut conn, &run_id, Some(&step_id), "not_closed", &payload)?
            }
        };
        lines.push(line);
    }

    let swept = match &hold.job {
        Some(job) => match job.terminate() {
            Ok(()) => true,
            Err(failure) => {
                log::warn!("the run's job could not be terminated: {}", failure.0);
                false
            }
        },
        None => false,
    };
    lines.push(runs::append_event(
        &mut conn,
        &run_id,
        None,
        "stopped",
        &serde_json::json!({ "closed": closed, "notClosed": not_closed, "swept": swept }),
    )?);
    Ok(lines)
}

/// Close the run with its outcome. What it held is released — not closed: a
/// program the run left open stays open, and only a hold or a Stop ends a
/// program. The job handle goes with it, without ending the job's processes.
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
        .remove(&run_id);
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

/// Put a step's window where the step says, and write what happened (F6).
///
/// The placement was decided by the domain; this looks for the window of the
/// process **this run started** — never any other — waits a moment for it to
/// appear, and reports. What could not be done as asked is a note on the line,
/// not a silence: a screen that is not there says so, and a program that never
/// shows a window of its own says that (risk R2).
#[tauri::command]
pub fn step_place(
    db: State<'_, Db>,
    held: State<'_, Held>,
    run_id: String,
    step_id: String,
    placement: window::Placement,
) -> Result<Event> {
    let mut conn = db.0.lock().expect("the database lock was poisoned");
    let run = runs::get_run(&conn, &run_id)?;
    if run.finished_at.is_some() {
        return Err(Error::InvalidInput("this run has already finished"));
    }

    // A dry run says what it would do and touches no window.
    if run.mode == "dry" {
        return runs::append_event(
            &mut conn,
            &run_id,
            Some(&step_id),
            "would_place",
            &serde_json::json!({
                "monitor": placement.monitor,
                "state": placement.state,
                "rect": placement.rect.map(|r| serde_json::json!({
                    "x": r.x, "y": r.y, "width": r.width, "height": r.height
                })),
            }),
        );
    }

    let pid = {
        let held = held.0.lock().expect("the held lock was poisoned");
        held.get(&run_id)
            .and_then(|hold| hold.children.get(&step_id))
            .map(|child| child.id())
    };
    let report = match pid {
        // Only a program this run started has a window this product may touch.
        None => window::Placed {
            placed: false,
            detail: String::new(),
            note: Some("this run did not start a program for that step".to_string()),
        },
        Some(pid) => window::place(pid, &placement, WINDOW_TIMEOUT),
    };

    runs::append_event(
        &mut conn,
        &run_id,
        Some(&step_id),
        if report.placed {
            "placed"
        } else {
            "not_placed"
        },
        &serde_json::json!({ "detail": report.detail, "note": report.note }),
    )
}

/// Write the line for a step that could not start, when the loop is what found
/// out (F7).
///
/// The host writes every other failure itself, because it is what tried. A
/// bookmark folder is different: the reading happens in the domain, between the
/// file and the browser, so the loop is where "there is no folder called that"
/// becomes known — and the log still gets it in the same shape, before the
/// screen does.
#[tauri::command]
pub fn step_failed(
    db: State<'_, Db>,
    run_id: String,
    step_id: String,
    launch: Launch,
    reason: String,
) -> Result<Event> {
    let mut conn = db.0.lock().expect("the database lock was poisoned");
    let run = runs::get_run(&conn, &run_id)?;
    if run.finished_at.is_some() {
        return Err(Error::InvalidInput("this run has already finished"));
    }
    let mut payload = launch.describe();
    payload["reason"] = serde_json::json!(reason);
    runs::append_event(&mut conn, &run_id, Some(&step_id), "failed", &payload)
}

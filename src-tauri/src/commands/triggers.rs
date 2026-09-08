//! Trigger commands (F9): a schedule, a shortcut, and the request a trigger
//! makes when it fires.
//!
//! A trigger binds to a profile id and to nothing else (ADR-013): never to a
//! file, and never to a profile that is still unreviewed — that is refused
//! here, and refused again by `run_begin` when the request arrives, because
//! the button is a courtesy and the host is the boundary.

use std::collections::HashMap;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

use crate::db::models::Profile;
use crate::db::{profiles, Db};
use crate::error::{Error, Result};
use crate::os::scheduler;

/// What a trigger asks for: a run of one profile, and why.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RunRequest {
    pub profile_id: String,
    pub trigger: String,
}

/// The request waiting for the interface to pick up, if any — the one that
/// started this process, or the last one a trigger made while it was open.
#[derive(Default)]
pub struct Pending(pub Mutex<Option<RunRequest>>);

/// Which profile each registered key combination belongs to.
#[derive(Default)]
pub struct Shortcuts(pub Mutex<HashMap<String, String>>);

/// The name of the event the interface listens for.
pub const RUN_REQUESTED: &str = "run-requested";

/// Read `--run <id> [--trigger <why>]` out of a command line. Anything else
/// on it is ignored; an id that is not this product's is ignored too.
pub fn request_from(argv: &[String]) -> Option<RunRequest> {
    let mut profile_id: Option<String> = None;
    let mut trigger = "command".to_string();
    let mut words = argv.iter().skip(1);
    while let Some(word) = words.next() {
        match word.as_str() {
            "--run" => profile_id = words.next().cloned(),
            "--trigger" => {
                if let Some(why) = words.next() {
                    trigger = why.clone();
                }
            }
            _ => {}
        }
    }
    let profile_id = profile_id?;
    if !scheduler::is_profile_id(&profile_id) {
        log::warn!("--run ignored: not a profile id");
        return None;
    }
    if !["schedule", "shortcut", "command"].contains(&trigger.as_str()) {
        trigger = "command".to_string();
    }
    log::info!("asked to run profile {profile_id} by {trigger}");
    Some(RunRequest {
        profile_id,
        trigger,
    })
}

/// Hand a request to the interface: remembered for a screen that is not
/// listening yet, announced for one that is, and the window brought forward
/// so what happens next is seen (ADR-016: never silence).
pub fn deliver(app: &AppHandle, request: RunRequest) {
    log::info!(
        "run request for profile {} by {} handed to the window",
        request.profile_id,
        request.trigger
    );
    if let Some(pending) = app.try_state::<Pending>() {
        *pending.0.lock().expect("the pending lock was poisoned") = Some(request.clone());
    }
    let _ = app.emit(RUN_REQUESTED, request);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// The request waiting to be run, taken: asked once, at the interface's start.
#[tauri::command]
pub fn pending_run(pending: State<'_, Pending>) -> Option<RunRequest> {
    pending
        .0
        .lock()
        .expect("the pending lock was poisoned")
        .take()
}

/// The shortcut in the words the system registers: `Win` is `Super` there.
fn accelerator(shortcut: &str) -> String {
    shortcut.replace("Win", "Super")
}

/// Register every stored shortcut with the system. Called at start, and
/// again after one changes. A combination the system refuses — taken by
/// another program — is logged and skipped; the profile keeps the text, and
/// the screen says it did not take.
pub fn register_all(app: &AppHandle) {
    let stored = {
        let db = app.state::<Db>();
        let conn = db.0.lock().expect("the database lock was poisoned");
        profiles::shortcuts(&conn).unwrap_or_default()
    };
    let manager = app.global_shortcut();
    let _ = manager.unregister_all();
    let mut map = HashMap::new();
    for (profile_id, shortcut) in stored {
        let accel = accelerator(&shortcut);
        match manager.register(accel.as_str()) {
            Ok(()) => {
                map.insert(accel, profile_id);
            }
            Err(error) => log::warn!("shortcut {shortcut} not registered: {error}"),
        }
    }
    if let Some(shortcuts) = app.try_state::<Shortcuts>() {
        *shortcuts.0.lock().expect("the shortcuts lock was poisoned") = map;
    }
}

/// The profile a key combination belongs to, when one is pressed.
pub fn profile_for(app: &AppHandle, accel: &str) -> Option<String> {
    let shortcuts = app.try_state::<Shortcuts>()?;
    let map = shortcuts.0.lock().expect("the shortcuts lock was poisoned");
    map.get(accel).cloned()
}

fn triggerable(profile: &Profile) -> Result<()> {
    if profile.imported_unreviewed {
        return Err(Error::Unreviewed);
    }
    Ok(())
}

/// Store a profile's schedule and hand it to the Task Scheduler; `{}` removes
/// both. The task is registered before the row is written, so a scheduler
/// that says no leaves the profile as it was.
#[tauri::command]
pub fn profile_schedule_set(
    db: State<'_, Db>,
    id: String,
    schedule_json: String,
) -> Result<Profile> {
    let mut conn = db.0.lock().expect("the database lock was poisoned");
    let profile = profiles::get_profile(&conn, &id)?;
    let schedule = scheduler::read(&schedule_json).map_err(Error::Scheduler)?;
    match &schedule {
        Some(schedule) => {
            triggerable(&profile)?;
            scheduler::register(&id, schedule).map_err(Error::Scheduler)?;
        }
        None => scheduler::unregister(&id).map_err(Error::Scheduler)?,
    }
    profiles::set_schedule(&mut conn, &id, &schedule_json)
}

/// Is the profile's task registered with Windows right now? Asked of the
/// scheduler, not of the database: what Diagnostics shows is what is there.
#[tauri::command]
pub fn schedule_registered(id: String) -> bool {
    scheduler::exists(&id)
}

/// Store a profile's key combination and register it; an empty one removes it.
#[tauri::command]
pub fn profile_shortcut_set(
    app: AppHandle,
    db: State<'_, Db>,
    id: String,
    shortcut: String,
) -> Result<Profile> {
    let updated = {
        let mut conn = db.0.lock().expect("the database lock was poisoned");
        let profile = profiles::get_profile(&conn, &id)?;
        if !shortcut.is_empty() {
            triggerable(&profile)?;
        }
        profiles::set_shortcut(&mut conn, &id, &shortcut)?
    };
    register_all(&app);
    if !shortcut.is_empty() && profile_for(&app, &accelerator(&shortcut)).as_deref() != Some(&id) {
        return Err(Error::Scheduler(format!(
            "{shortcut} could not be registered; another program may already have it"
        )));
    }
    Ok(updated)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn argv(words: &[&str]) -> Vec<String> {
        std::iter::once("deskstart.exe")
            .chain(words.iter().copied())
            .map(String::from)
            .collect()
    }

    #[test]
    fn a_run_request_is_read_off_the_command_line() {
        let id = "01927f7e-cafe-7000-8000-000000000001";
        assert_eq!(
            request_from(&argv(&["--run", id, "--trigger", "schedule"])),
            Some(RunRequest {
                profile_id: id.into(),
                trigger: "schedule".into()
            })
        );
        assert_eq!(
            request_from(&argv(&["--run", id])).map(|r| r.trigger),
            Some("command".into())
        );
        assert_eq!(
            request_from(&argv(&["--run", id, "--trigger", "evil"])).map(|r| r.trigger),
            Some("command".into())
        );
    }

    #[test]
    fn anything_that_is_not_a_profile_id_is_not_a_request() {
        assert_eq!(request_from(&argv(&[])), None);
        assert_eq!(request_from(&argv(&["--run"])), None);
        assert_eq!(request_from(&argv(&["--run", "C:\\evil.json"])), None);
        assert_eq!(request_from(&argv(&["--run", "../x"])), None);
    }

    #[test]
    fn the_windows_key_is_super_to_the_system() {
        assert_eq!(accelerator("Ctrl+Win+D"), "Ctrl+Super+D");
        assert_eq!(accelerator("Ctrl+Alt+D"), "Ctrl+Alt+D");
    }
}

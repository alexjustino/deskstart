//! Deskstart — open your working day with one button.
//!
//! # Layering
//!
//! This crate is deliberately thin. It owns three things and nothing else:
//! storage (SQLite, transactions, migrations, the append-only run log), the
//! operating system (starting processes, window material, accent colour), and
//! the typed command boundary. Rules — what a profile may contain, what runs
//! next, how a run's outcome is judged — are pure TypeScript in `src/domain/`,
//! where they can be unit-tested without a window (ADR-003, ADR-012).
//!
//! # Changelog of this entry point
//!
//! - F0: database opened and migrated at startup, single-instance guard,
//!   rotating file log, accent ramp, profiles and steps, a run that starts a
//!   program from an argument vector and appends what happened to the log.
//! - F1: folder, file and url steps (migration 002), opened by verb on a
//!   validated target; the allow-listed environment for path expansion; a
//!   step can be moved within its profile.
//! - F2: the processes a run starts are held for its life; a hold ends with
//!   a close (windows asked, then terminated after a grace); pauses are logged.
//! - F4: what a step waits for (migration 003), asked of the host by window
//!   or by port while the step waits.
//! - F5: a profile read from and written to one file the person chose, and
//!   imported unreviewed (migration 004) — accepted a step at a time before it
//!   may run at all.
//! - F6: the screens this machine has, and the window of a process the run
//!   started put where the step says (migration 005).
//! - F7: the tools it can call — Chrome, Edge, Windows Terminal, VS Code —
//!   found in known places and never on PATH, and one browser's bookmarks file
//!   read for the domain to make sense of.
//! - F8: three hypervisors (migration 007), asked as commands that run to an
//!   end within a budget; Hyper-V through a constant PowerShell command with
//!   the machine's name in the environment.

pub mod commands;
pub mod db;
pub mod error;
pub mod os;

use std::sync::Mutex;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // A second launch must focus the window that already exists rather than
    // opening a rival one — two processes would fight over the same database
    // and a scheduled run could be started twice.
    #[cfg(all(desktop, not(any(target_os = "android", target_os = "ios"))))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        // The system's own file dialogs, and nothing else from the filesystem:
        // the plugin returns a path, and the host's own command reads or writes
        // exactly that one file (F5).
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                // `Builder::new` arrives with a default target set. Adding to it
                // rather than replacing it writes every line twice.
                .clear_targets()
                // Logs stay on this machine. There is no remote sink, by design.
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::LogDir { file_name: None },
                ))
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Stdout,
                ))
                .level(log::LevelFilter::Info)
                .build(),
        )
        .setup(|app| {
            let connection = db::open(app.handle())?;
            app.manage(db::Db(Mutex::new(connection)));
            app.manage(commands::runs::Held::default());
            log::info!(
                "workspace opened; Deskstart {} ready",
                env!("CARGO_PKG_VERSION")
            );
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::system::system_info,
            commands::system::accent_ramp,
            commands::system::environment,
            commands::system::monitors,
            commands::system::tools_list,
            commands::system::bookmarks_read,
            commands::profiles::profiles_list,
            commands::profiles::profile_create,
            commands::profiles::profile_rename,
            commands::profiles::profile_delete,
            commands::profiles::steps_list,
            commands::profiles::step_add,
            commands::profiles::step_update,
            commands::profiles::step_delete,
            commands::profiles::step_move,
            commands::profiles::profile_import,
            commands::profiles::step_accept,
            commands::profiles::profile_accept,
            commands::profiles::profile_file_read,
            commands::profiles::profile_file_write,
            commands::runs::run_begin,
            commands::runs::step_execute,
            commands::runs::step_close,
            commands::runs::step_wait,
            commands::runs::step_place,
            commands::runs::step_probe,
            commands::runs::step_waiting_for,
            commands::runs::step_ready,
            commands::runs::step_skipped,
            commands::runs::step_failed,
            commands::runs::run_stop,
            commands::runs::run_finish,
            commands::runs::runs_list,
            commands::runs::events_list,
        ])
        .run(tauri::generate_context!())
        .expect("Deskstart failed to start");
}

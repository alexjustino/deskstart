//! System-level commands: identity, theme input, and the environment a path may use.

use std::collections::BTreeMap;

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::db::{backup, database_path, migrations, settings, Db, DATA_DIR_ENV};
use crate::error::Result;
use crate::os::{accent, files, tools, window};

/// What Diagnostics and About read. Never a hand-typed constant: the version
/// comes from the running binary.
#[derive(Serialize)]
pub struct SystemInfo {
    pub name: &'static str,
    pub version: &'static str,
    pub schema_version: i64,
    pub expected_schema_version: i64,
    pub database_path: String,
    pub database_bytes: u64,
    /// True when `DESKSTART_DATA_DIR` moved the workspace — a relocated
    /// workspace is never a silent one.
    pub database_relocated: bool,
    pub platform: &'static str,
}

#[tauri::command]
pub fn system_info(app: AppHandle, db: State<'_, Db>) -> Result<SystemInfo> {
    let path = crate::db::database_path(&app)?;
    let database_bytes = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    let database_relocated = std::env::var_os(DATA_DIR_ENV).is_some_and(|v| !v.is_empty());

    let conn = db.0.lock().expect("the database lock was poisoned");

    Ok(SystemInfo {
        name: "Deskstart",
        version: env!("CARGO_PKG_VERSION"),
        schema_version: migrations::current_version(&conn),
        expected_schema_version: migrations::target_version(),
        database_path: path.to_string_lossy().into_owned(),
        database_bytes,
        database_relocated,
        platform: std::env::consts::OS,
    })
}

/// The Windows accent ramp. The frontend writes it into the token layer, so the
/// application follows the colour the user chose for their desktop.
#[tauri::command]
pub fn accent_ramp() -> accent::AccentRamp {
    accent::read()
}

/// The environment names a path in a profile may use (ADR-010). The same six
/// the domain's `resolvePath` accepts — this is the map it expands from.
pub const ALLOWED_ENVIRONMENT: [&str; 6] = [
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "PROGRAMFILES",
    "PROGRAMFILES(X86)",
    "SYSTEMROOT",
];

/// The allow-listed environment, name to value, for those the system defines.
/// Nothing else leaves the host: the interface never sees `PATH` or a secret
/// someone put in an environment variable.
#[tauri::command]
pub fn environment() -> BTreeMap<String, String> {
    ALLOWED_ENVIRONMENT
        .iter()
        .filter_map(|name| {
            std::env::var(name)
                .ok()
                .map(|value| (name.to_string(), value))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_environment_only_ever_holds_allow_listed_names() {
        let env = environment();
        for name in env.keys() {
            assert!(
                ALLOWED_ENVIRONMENT.contains(&name.as_str()),
                "{name} leaked"
            );
        }
        assert!(!env.contains_key("PATH"));
    }

    #[cfg(windows)]
    #[test]
    fn windows_defines_the_system_root() {
        let env = environment();
        assert!(env
            .get("SYSTEMROOT")
            .is_some_and(|v| v.ends_with("Windows")));
    }
}

/// The screens this machine has, primary first (F6).
///
/// The editor offers this list and a placement names a number from it, so what
/// a person picks and what the run does mean the same thing. A machine that
/// answers with nothing — no screen the host could enumerate — is a list the
/// editor shows as such rather than a silent empty dropdown.
#[tauri::command]
pub fn monitors() -> Vec<window::Monitor> {
    window::monitors()
}

/// The tools this product can call, and where each one is (F7).
///
/// Found or not found, always both said: the editor shows a step that names a
/// tool this machine has not got, and the run records the same sentence.
#[tauri::command]
pub fn tools_list() -> Vec<tools::Tool> {
    tools::all()
}

/// One browser's bookmarks file, as text.
///
/// The host reads it because it is the side that may touch a disk; what a
/// folder is, and which pages are in it, is the domain's business
/// (`domain/bookmarks`). A bookmarks file is bigger than a profile — it holds
/// everything a person ever kept — so it has a cap of its own.
#[tauri::command]
pub fn bookmarks_read(browser: String) -> Result<String> {
    let path = tools::bookmarks_file(&browser).ok_or(crate::error::Error::File(
        "that browser is not one this product reads",
    ))?;
    files::read_text_capped(&path, files::MAX_BOOKMARKS_BYTES)
}

/// Every setting a person has chosen, key to value (F10). What a value means,
/// and what an unknown one falls back to, is the domain's (`domain/settings`).
#[tauri::command]
pub fn settings_all(db: State<'_, Db>) -> Result<std::collections::BTreeMap<String, String>> {
    let conn = db.0.lock().expect("the database lock was poisoned");
    settings::all(&conn)
}

/// Store one setting, replacing what was there.
#[tauri::command]
pub fn setting_set(db: State<'_, Db>, key: String, value: String) -> Result<()> {
    let conn = db.0.lock().expect("the database lock was poisoned");
    settings::set(&conn, &key, &value)
}

/// Write the whole workspace to the file the person chose (F10).
#[tauri::command]
pub fn workspace_backup(db: State<'_, Db>, path: String) -> Result<()> {
    let conn = db.0.lock().expect("the database lock was poisoned");
    backup::backup_to(&conn, &std::path::PathBuf::from(path))
}

/// Read what a backup holds, without touching the workspace. The interface
/// shows this before it offers to restore.
#[tauri::command]
pub fn workspace_backup_summary(path: String) -> Result<backup::BackupSummary> {
    backup::inspect(&std::path::PathBuf::from(path))
}

/// Validate a backup and stage it to replace the workspace at the next start.
/// The summary of what will replace it comes back so the interface can say so.
#[tauri::command]
pub fn workspace_restore(app: AppHandle, path: String) -> Result<backup::BackupSummary> {
    let workspace = database_path(&app)?;
    backup::stage_restore(&workspace, &std::path::PathBuf::from(path))
}

/// Restart the product, so a staged restore is applied. Called only after a
/// restore has been staged and the person has been told what it will do.
#[tauri::command]
pub fn restart(app: AppHandle) {
    app.restart();
}

//! System-level commands: identity and theme input.

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::db::{migrations, Db, DATA_DIR_ENV};
use crate::error::Result;
use crate::os::accent;

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

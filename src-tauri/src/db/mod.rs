//! Persistence: a thin repository over SQLite. No business logic lives here.
//!
//! The rule that keeps this module small: what a profile may contain and what
//! a run does next are pure TypeScript in `src/domain/`. Rust owns storage,
//! transactions, migrations, the append-only run log and the operating system.

pub mod migrations;
pub mod models;
pub mod profiles;
pub mod runs;

use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::Connection;
use tauri::{AppHandle, Manager};

use crate::error::{Error, Result};

/// The open database, held for the lifetime of the process.
pub struct Db(pub Mutex<Connection>);

/// The environment variable that relocates the workspace.
///
/// Set by the end-to-end suite so a test run never opens the person's real
/// workspace. It is read once, here, and reported by Diagnostics, so a relocated
/// workspace is never a silent one.
pub const DATA_DIR_ENV: &str = "DESKSTART_DATA_DIR";

/// The workspace file name.
pub const DATABASE_FILE: &str = "deskstart.sqlite3";

/// Resolve the workspace file: `%APPDATA%/io.github.alexjustino.deskstart/deskstart.sqlite3`,
/// or `$DESKSTART_DATA_DIR/deskstart.sqlite3` when the variable is set.
pub fn database_path(app: &AppHandle) -> Result<PathBuf> {
    let dir = match std::env::var_os(DATA_DIR_ENV) {
        Some(dir) if !dir.is_empty() => PathBuf::from(dir),
        _ => app.path().app_data_dir().map_err(|_| Error::DataDir)?,
    };
    std::fs::create_dir_all(&dir).map_err(|_| Error::DataDir)?;
    Ok(dir.join(DATABASE_FILE))
}

/// Open the workspace, apply pending migrations, and return the connection.
pub fn open(app: &AppHandle) -> Result<Connection> {
    open_at(&database_path(app)?)
}

/// Open a workspace file the way start-up does.
pub fn open_at(path: &std::path::Path) -> Result<Connection> {
    let conn = Connection::open(path)?;

    // WAL keeps readers from blocking the writer and survives a hard kill far
    // better than the rollback journal. NORMAL is the correct companion to WAL:
    // durable across application crash, and only at risk on OS power loss.
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.pragma_update(None, "busy_timeout", 5_000)?;

    migrations::apply(&conn)?;
    Ok(conn)
}

/// The instant, as every timestamp column stores it: UTC, milliseconds, `Z`.
pub fn now() -> String {
    chrono::Utc::now()
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string()
}

/// A new identifier. UUID v7 sorts by creation time, which keeps insertion
/// order readable in the file without a second column.
pub fn new_id() -> String {
    uuid::Uuid::now_v7().to_string()
}

//! Backup and restore of the whole workspace (F10, ADR-025).
//!
//! A backup is the workspace, entire: every profile, step, run, event and
//! setting, in one consistent SQLite file written by `VACUUM INTO`. Nothing is
//! serialised into a format of our own — the file *is* the workspace, so a
//! backup can never drift from what a restore expects, and a restore is not an
//! import that has to understand each row.
//!
//! A restore replaces the workspace with a backup. That is not an edit of the
//! run log — the log is append-only and its triggers refuse a delete (ADR-011)
//! — it is swapping one workspace file for another, and a file is not mutated
//! by being replaced. But the live file is open and locked while the product
//! runs, so a restore cannot overwrite it in place. Instead it **stages**: the
//! chosen backup, validated, is written beside the workspace as `<name>.pending`,
//! and applied at the next start, before the workspace is opened. The product
//! restarts itself so "the next start" is now.
//!
//! A file handed to restore is untrusted (SECURITY.md): it is opened read-only
//! and checked to be a Deskstart workspace no newer than this build before it
//! is staged, so a garbage or future file is refused with a sentence rather
//! than swapped in and discovered at the next boot.

use std::path::{Path, PathBuf};

use rusqlite::{Connection, OpenFlags};
use serde::Serialize;

use crate::db::migrations;
use crate::error::{Error, Result};

/// The tables a Deskstart workspace has. A file without them is not one.
const REQUIRED_TABLES: [&str; 5] = ["workspace", "profile", "step", "run", "event"];

/// What a backup file holds, read before it is trusted.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BackupSummary {
    pub schema_version: i64,
    pub profiles: i64,
    pub runs: i64,
}

/// The path a staged restore waits at until the next start.
pub fn pending_path(workspace: &Path) -> PathBuf {
    let mut name = workspace.file_name().unwrap_or_default().to_os_string();
    name.push(".pending");
    workspace.with_file_name(name)
}

/// Write the workspace to `dest` as one consistent file.
///
/// `VACUUM INTO` folds the write-ahead log in and takes a read lock only, so a
/// run in progress is captured whole and is not blocked by the backup.
pub fn backup_to(conn: &Connection, dest: &Path) -> Result<()> {
    if dest.exists() {
        std::fs::remove_file(dest)
            .map_err(|_| Error::File("the backup could not replace the file already there"))?;
    }
    let target = dest.to_string_lossy().replace('\'', "''");
    conn.execute_batch(&format!("VACUUM INTO '{target}'"))?;
    Ok(())
}

/// Read what a backup holds, refusing anything that is not a workspace this
/// build can open.
pub fn inspect(path: &Path) -> Result<BackupSummary> {
    if !path.is_file() {
        return Err(Error::File("that is not a file"));
    }
    let conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|_| Error::File("that file is not a Deskstart backup"))?;

    for table in REQUIRED_TABLES {
        let found: i64 = conn
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                [table],
                |row| row.get(0),
            )
            .unwrap_or(0);
        if found == 0 {
            return Err(Error::File("that file is not a Deskstart backup"));
        }
    }

    let schema_version: i64 = conn
        .query_row(
            "SELECT schema_version FROM workspace WHERE id = 1",
            [],
            |r| r.get(0),
        )
        .map_err(|_| Error::File("that file is not a Deskstart backup"))?;
    if schema_version < 1 || schema_version > migrations::target_version() {
        return Err(Error::File(
            "that backup is from a newer version of Deskstart than this one",
        ));
    }

    let profiles: i64 = conn
        .query_row("SELECT count(*) FROM profile", [], |r| r.get(0))
        .unwrap_or(0);
    let runs: i64 = conn
        .query_row("SELECT count(*) FROM run", [], |r| r.get(0))
        .unwrap_or(0);

    Ok(BackupSummary {
        schema_version,
        profiles,
        runs,
    })
}

/// Validate a backup and stage it to be applied at the next start.
///
/// The workspace is not touched now; the summary of what will replace it is
/// returned so the interface can say so before it restarts.
pub fn stage_restore(workspace: &Path, src: &Path) -> Result<BackupSummary> {
    let summary = inspect(src)?;
    let pending = pending_path(workspace);
    std::fs::copy(src, &pending).map_err(|_| Error::File("the backup could not be staged"))?;
    Ok(summary)
}

/// Apply a staged restore if one is waiting, before the workspace is opened.
///
/// Called once at start-up. The pending file has already been validated as a
/// workspace; here it simply becomes the workspace, and the stray WAL and
/// shared-memory files of the old one are cleared so nothing of it survives the
/// swap. A pending file that cannot be applied is left in place and logged, so
/// a restore never quietly loses the workspace it was about to replace.
pub fn apply_pending(workspace: &Path) -> Result<()> {
    let pending = pending_path(workspace);
    if !pending.is_file() {
        return Ok(());
    }
    log::info!("applying a staged restore");
    std::fs::rename(&pending, workspace)
        .map_err(|_| Error::File("a staged restore could not be applied"))?;
    for suffix in ["-wal", "-shm"] {
        let mut name = workspace.file_name().unwrap_or_default().to_os_string();
        name.push(suffix);
        let stray = workspace.with_file_name(name);
        let _ = std::fs::remove_file(stray);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{open_at, profiles};

    struct Scratch(PathBuf);
    impl Scratch {
        fn new(name: &str) -> Self {
            let dir = std::env::temp_dir().join(format!("deskstart-backup-{name}"));
            let _ = std::fs::remove_dir_all(&dir);
            std::fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }
        fn join(&self, name: &str) -> PathBuf {
            self.0.join(name)
        }
    }
    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn a_backup_is_a_whole_workspace_that_restores_every_profile() {
        let scratch = Scratch::new("round-trip");
        let workspace = scratch.join("deskstart.sqlite3");
        {
            let conn = open_at(&workspace).unwrap();
            profiles::create_profile(&conn, "Morning").unwrap();
            profiles::create_profile(&conn, "Evening").unwrap();
        }

        let backup = scratch.join("backup.deskstart-backup");
        {
            let conn = open_at(&workspace).unwrap();
            backup_to(&conn, &backup).unwrap();
        }
        let summary = inspect(&backup).unwrap();
        assert_eq!(summary.profiles, 2);
        assert_eq!(summary.schema_version, migrations::target_version());

        // A workspace with one profile, restored from the backup of two.
        let other = scratch.join("other.sqlite3");
        {
            let conn = open_at(&other).unwrap();
            profiles::create_profile(&conn, "Only me").unwrap();
        }
        stage_restore(&other, &backup).unwrap();
        apply_pending(&other).unwrap();
        let conn = open_at(&other).unwrap();
        let names: Vec<String> = profiles::list_profiles(&conn)
            .unwrap()
            .into_iter()
            .map(|p| p.name)
            .collect();
        assert_eq!(names, ["Morning", "Evening"]);
    }

    #[test]
    fn a_file_that_is_not_a_workspace_is_refused_before_it_is_staged() {
        let scratch = Scratch::new("garbage");
        let workspace = scratch.join("deskstart.sqlite3");
        open_at(&workspace).unwrap();

        let garbage = scratch.join("notes.txt");
        std::fs::write(&garbage, "these are not the droids you are looking for").unwrap();
        assert!(matches!(inspect(&garbage), Err(Error::File(_))));
        assert!(matches!(
            stage_restore(&workspace, &garbage),
            Err(Error::File(_))
        ));
        assert!(!pending_path(&workspace).exists(), "nothing was staged");
    }

    #[test]
    fn a_backup_from_a_newer_version_is_refused() {
        let scratch = Scratch::new("newer");
        let backup = scratch.join("future.sqlite3");
        {
            let conn = open_at(&backup).unwrap();
            conn.execute(
                "UPDATE workspace SET schema_version = ?1",
                [migrations::target_version() + 1],
            )
            .unwrap();
        }
        assert!(matches!(inspect(&backup), Err(Error::File(_))));
    }

    #[test]
    fn no_pending_restore_is_a_quiet_no_op() {
        let scratch = Scratch::new("none");
        let workspace = scratch.join("deskstart.sqlite3");
        open_at(&workspace).unwrap();
        assert!(apply_pending(&workspace).is_ok());
    }
}

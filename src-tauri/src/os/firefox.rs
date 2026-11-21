//! Firefox's bookmarks (1.1).
//!
//! Chrome and Edge keep bookmarks in a JSON file the host can hand up as it
//! is. Firefox keeps them in `places.sqlite`, a database it holds open — and
//! whose newest changes sit in `places.sqlite-wal` until Firefox folds them
//! in. So the host never opens Firefox's own file: it copies the database and
//! its log into a folder of its own, reads the bookmark rows from the copy,
//! and deletes the copy. Firefox is never touched, locked or written.
//!
//! Which database: the profile Firefox itself starts with, as `profiles.ini`
//! says — the `Default=` of an `[Install…]` section first (what this Firefox
//! installation uses), then a `[Profile…]` marked `Default=1`. What the rows
//! mean — which folder is which — is the domain's (`domain/bookmarks`).

use std::path::{Path, PathBuf};

use rusqlite::{Connection, OpenFlags};
use serde::Serialize;

/// The largest `places.sqlite` this reads. Bookmarks and history share it; a
/// heavy user's is tens of megabytes. Past this, it is not copied at all.
const MAX_PLACES_BYTES: u64 = 512 * 1024 * 1024;

/// Where Firefox keeps `profiles.ini` for this Windows user, or where a test
/// says it is (`DESKSTART_FIREFOX_DIR`, the E2E suite's fixture).
fn firefox_dir() -> Option<PathBuf> {
    if let Some(dir) = std::env::var_os("DESKSTART_FIREFOX_DIR") {
        return Some(PathBuf::from(dir));
    }
    Some(PathBuf::from(std::env::var_os("APPDATA")?).join(r"Mozilla\Firefox"))
}

/// The default profile's folder, as `profiles.ini` names it: relative to the
/// Firefox folder unless it says otherwise.
pub fn default_profile(ini: &str) -> Option<(String, bool)> {
    let mut section = String::new();
    let mut install_default: Option<String> = None;
    let mut profiles: Vec<(String, bool, bool)> = Vec::new(); // path, relative, default
    let mut current: Option<(Option<String>, bool, bool)> = None;

    let flush = |current: &mut Option<(Option<String>, bool, bool)>,
                 profiles: &mut Vec<(String, bool, bool)>| {
        if let Some((Some(path), relative, default)) = current.take() {
            profiles.push((path, relative, default));
        }
    };

    for raw in ini.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with(';') || line.starts_with('#') {
            continue;
        }
        if line.starts_with('[') && line.ends_with(']') {
            flush(&mut current, &mut profiles);
            section = line[1..line.len() - 1].to_string();
            if section.starts_with("Profile") {
                current = Some((None, true, false));
            }
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let (key, value) = (key.trim(), value.trim());
        if section.starts_with("Install") && key == "Default" && install_default.is_none() {
            install_default = Some(value.to_string());
        } else if let Some(profile) = current.as_mut() {
            match key {
                "Path" => profile.0 = Some(value.to_string()),
                "IsRelative" => profile.1 = value != "0",
                "Default" => profile.2 = value == "1",
                _ => {}
            }
        }
    }
    flush(&mut current, &mut profiles);

    if let Some(path) = install_default {
        // An install's default names a profile by its path; that profile says
        // whether the path is relative, and an install's is unless it says not.
        let relative = profiles
            .iter()
            .find(|(p, _, _)| *p == path)
            .map(|(_, relative, _)| *relative)
            .unwrap_or(true);
        return Some((path, relative));
    }
    profiles
        .into_iter()
        .find(|(_, _, default)| *default)
        .map(|(path, relative, _)| (path, relative))
}

/// One bookmark row, as the domain reads it.
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct Row {
    pub id: i64,
    #[serde(rename = "type")]
    pub kind: i64,
    pub parent: i64,
    pub position: i64,
    pub title: String,
    pub url: Option<String>,
    pub guid: String,
}

/// Read the bookmark rows of the database at `places`, through a copy made
/// in `scratch` — never the file Firefox holds.
pub fn rows_from(places: &Path, scratch: &Path) -> Result<Vec<Row>, &'static str> {
    let size = std::fs::metadata(places)
        .map_err(|_| "Firefox has no bookmarks database in its profile")?
        .len();
    if size > MAX_PLACES_BYTES {
        return Err("Firefox's bookmarks database is too large to read");
    }
    std::fs::create_dir_all(scratch).map_err(|_| "a working copy could not be made")?;
    let copy = scratch.join("places.sqlite");
    std::fs::copy(places, &copy).map_err(|_| "Firefox's bookmarks could not be copied")?;
    // The newest bookmarks may still be in the write-ahead log: copy it beside.
    let wal = places.with_file_name("places.sqlite-wal");
    if wal.is_file() {
        let _ = std::fs::copy(&wal, scratch.join("places.sqlite-wal"));
    }

    let read = (|| -> rusqlite::Result<Vec<Row>> {
        let conn = Connection::open_with_flags(
            &copy,
            OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )?;
        let mut statement = conn.prepare(
            "SELECT b.id, b.type, b.parent, b.position, COALESCE(b.title, ''), p.url, COALESCE(b.guid, '')
             FROM moz_bookmarks b LEFT JOIN moz_places p ON p.id = b.fk
             ORDER BY b.parent, b.position",
        )?;
        let rows = statement
            .query_map([], |row| {
                Ok(Row {
                    id: row.get(0)?,
                    kind: row.get(1)?,
                    parent: row.get(2)?,
                    position: row.get(3)?,
                    title: row.get(4)?,
                    url: row.get(5)?,
                    guid: row.get(6)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<Row>>>()?;
        Ok(rows)
    })();
    let _ = std::fs::remove_dir_all(scratch);
    read.map_err(|_| "Firefox's bookmarks could not be read")
}

/// Firefox's bookmark rows for this Windows user, as JSON text for the domain.
pub fn bookmarks_json() -> Result<String, &'static str> {
    let dir = firefox_dir().ok_or("Firefox's folder could not be found")?;
    let ini = std::fs::read_to_string(dir.join("profiles.ini"))
        .map_err(|_| "Firefox has no profile on this machine yet")?;
    let (path, relative) = default_profile(&ini).ok_or("Firefox has no default profile")?;
    let profile = if relative {
        dir.join(path.replace('/', "\\"))
    } else {
        PathBuf::from(path)
    };
    let scratch = std::env::temp_dir().join(format!("deskstart-firefox-{}", uuid::Uuid::now_v7()));
    let rows = rows_from(&profile.join("places.sqlite"), &scratch)?;
    serde_json::to_string(&rows).map_err(|_| "Firefox's bookmarks could not be read")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_install_default_wins_and_is_relative_unless_said() {
        let ini = "[Install308046B0AF4A39CB]\nDefault=Profiles/abc.default-release\nLocked=1\n\n\
                   [Profile1]\nName=default\nIsRelative=1\nPath=Profiles/old.default\nDefault=1\n\n\
                   [Profile0]\nName=default-release\nIsRelative=1\nPath=Profiles/abc.default-release\n";
        assert_eq!(
            default_profile(ini),
            Some(("Profiles/abc.default-release".to_string(), true))
        );
    }

    #[test]
    fn without_an_install_the_profile_marked_default_is_used() {
        let ini = "[General]\nStartWithLastProfile=1\n\n[Profile0]\nName=a\nIsRelative=0\nPath=D:\\FF\\a\n\n\
                   [Profile1]\nName=b\nIsRelative=1\nPath=Profiles/b\nDefault=1\n";
        assert_eq!(default_profile(ini), Some(("Profiles/b".to_string(), true)));
        let absolute = "[Profile0]\nIsRelative=0\nPath=D:\\FF\\a\nDefault=1\n";
        assert_eq!(
            default_profile(absolute),
            Some(("D:\\FF\\a".to_string(), false))
        );
    }

    #[test]
    fn nothing_to_go_on_is_none_not_a_panic() {
        assert_eq!(default_profile(""), None);
        assert_eq!(default_profile("[Profile0]\nName=x\n"), None);
    }

    #[test]
    fn the_rows_come_from_a_copy_and_the_copy_is_gone_after() {
        let base = std::env::temp_dir().join(format!("deskstart-ff-test-{}", uuid::Uuid::now_v7()));
        std::fs::create_dir_all(&base).unwrap();
        let places = base.join("places.sqlite");
        {
            let conn = Connection::open(&places).unwrap();
            conn.execute_batch(
                "CREATE TABLE moz_places (id INTEGER PRIMARY KEY, url TEXT);
                 CREATE TABLE moz_bookmarks (id INTEGER PRIMARY KEY, type INTEGER, fk INTEGER,
                   parent INTEGER, position INTEGER, title TEXT, guid TEXT);
                 INSERT INTO moz_places VALUES (1, 'https://example.com/a');
                 INSERT INTO moz_bookmarks VALUES
                   (1, 2, NULL, 0, 0, '', 'root________'),
                   (3, 2, NULL, 1, 1, 'toolbar', 'toolbar_____'),
                   (10, 2, NULL, 3, 0, 'Work', 'work________'),
                   (11, 1, 1, 10, 0, 'A', 'a___________');",
            )
            .unwrap();
        }
        let scratch = base.join("copy");
        let rows = rows_from(&places, &scratch).unwrap();
        assert_eq!(rows.len(), 4);
        assert!(rows
            .iter()
            .any(|r| r.url.as_deref() == Some("https://example.com/a") && r.parent == 10));
        assert!(!scratch.exists(), "the working copy is removed");
        assert!(places.is_file(), "the original is left as it was");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn a_profile_with_no_database_says_so() {
        let missing = std::env::temp_dir().join("deskstart-no-such-profile/places.sqlite");
        assert_eq!(
            rows_from(&missing, &std::env::temp_dir().join("deskstart-unused")),
            Err("Firefox has no bookmarks database in its profile")
        );
    }
}

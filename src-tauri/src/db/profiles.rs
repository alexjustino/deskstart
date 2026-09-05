//! Profiles and their steps: CRUD, nothing cleverer.

use rusqlite::{params, Connection, OptionalExtension};

use crate::db::models::{Profile, Step};
use crate::db::{new_id, now};
use crate::error::{Error, Result};

const PROFILE_COLUMNS: &str = "id, name, position, imported_unreviewed, created_at, updated_at";
const STEP_COLUMNS: &str =
    "id, profile_id, position, kind, config_json, timing_json, created_at, updated_at";

fn read_profile(row: &rusqlite::Row<'_>) -> rusqlite::Result<Profile> {
    Ok(Profile {
        id: row.get(0)?,
        name: row.get(1)?,
        position: row.get(2)?,
        imported_unreviewed: row.get::<_, i64>(3)? != 0,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

fn read_step(row: &rusqlite::Row<'_>) -> rusqlite::Result<Step> {
    Ok(Step {
        id: row.get(0)?,
        profile_id: row.get(1)?,
        position: row.get(2)?,
        kind: row.get(3)?,
        config_json: row.get(4)?,
        timing_json: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

pub fn list_profiles(conn: &Connection) -> Result<Vec<Profile>> {
    let mut statement = conn.prepare(&format!(
        "SELECT {PROFILE_COLUMNS} FROM profile ORDER BY position, created_at"
    ))?;
    let rows = statement.query_map([], read_profile)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn get_profile(conn: &Connection, id: &str) -> Result<Profile> {
    conn.query_row(
        &format!("SELECT {PROFILE_COLUMNS} FROM profile WHERE id = ?1"),
        [id],
        read_profile,
    )
    .optional()?
    .ok_or(Error::NotFound)
}

pub fn create_profile(conn: &Connection, name: &str) -> Result<Profile> {
    let name = name.trim();
    if name.is_empty() {
        return Err(Error::InvalidInput("a profile needs a name"));
    }
    let position: i64 = conn.query_row(
        "SELECT coalesce(max(position), -1) + 1 FROM profile",
        [],
        |r| r.get(0),
    )?;
    let id = new_id();
    let stamp = now();
    conn.execute(
        "INSERT INTO profile (id, name, position, imported_unreviewed, created_at, updated_at)
         VALUES (?1, ?2, ?3, 0, ?4, ?4)",
        params![id, name, position, stamp],
    )?;
    get_profile(conn, &id)
}

pub fn rename_profile(conn: &Connection, id: &str, name: &str) -> Result<Profile> {
    let name = name.trim();
    if name.is_empty() {
        return Err(Error::InvalidInput("a profile needs a name"));
    }
    let changed = conn.execute(
        "UPDATE profile SET name = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, name, now()],
    )?;
    if changed == 0 {
        return Err(Error::NotFound);
    }
    get_profile(conn, id)
}

/// Remove a profile and its steps. Runs it made keep its name and survive it.
pub fn delete_profile(conn: &Connection, id: &str) -> Result<()> {
    let changed = conn.execute("DELETE FROM profile WHERE id = ?1", [id])?;
    if changed == 0 {
        return Err(Error::NotFound);
    }
    Ok(())
}

pub fn list_steps(conn: &Connection, profile_id: &str) -> Result<Vec<Step>> {
    let mut statement = conn.prepare(&format!(
        "SELECT {STEP_COLUMNS} FROM step WHERE profile_id = ?1 ORDER BY position, created_at"
    ))?;
    let rows = statement.query_map([profile_id], read_step)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn get_step(conn: &Connection, id: &str) -> Result<Step> {
    conn.query_row(
        &format!("SELECT {STEP_COLUMNS} FROM step WHERE id = ?1"),
        [id],
        read_step,
    )
    .optional()?
    .ok_or(Error::NotFound)
}

/// Append a step to a profile. The configuration arrives already validated by
/// the domain; the host checks only that it is JSON, because a row that is not
/// JSON could never be read back.
pub fn add_step(
    conn: &Connection,
    profile_id: &str,
    kind: &str,
    config_json: &str,
) -> Result<Step> {
    get_profile(conn, profile_id)?;
    if kind != "app" {
        return Err(Error::InvalidInput(
            "that kind of step is not supported yet",
        ));
    }
    if serde_json::from_str::<serde_json::Value>(config_json).is_err() {
        return Err(Error::InvalidInput("the step configuration is not valid"));
    }
    let position: i64 = conn.query_row(
        "SELECT coalesce(max(position), -1) + 1 FROM step WHERE profile_id = ?1",
        [profile_id],
        |r| r.get(0),
    )?;
    let id = new_id();
    let stamp = now();
    conn.execute(
        "INSERT INTO step (id, profile_id, position, kind, config_json, timing_json, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, '{}', ?6, ?6)",
        params![id, profile_id, position, kind, config_json, stamp],
    )?;
    touch_profile(conn, profile_id)?;
    get_step(conn, &id)
}

pub fn update_step(conn: &Connection, id: &str, config_json: &str) -> Result<Step> {
    if serde_json::from_str::<serde_json::Value>(config_json).is_err() {
        return Err(Error::InvalidInput("the step configuration is not valid"));
    }
    let changed = conn.execute(
        "UPDATE step SET config_json = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, config_json, now()],
    )?;
    if changed == 0 {
        return Err(Error::NotFound);
    }
    let step = get_step(conn, id)?;
    touch_profile(conn, &step.profile_id)?;
    Ok(step)
}

pub fn delete_step(conn: &Connection, id: &str) -> Result<()> {
    let step = get_step(conn, id)?;
    conn.execute("DELETE FROM step WHERE id = ?1", [id])?;
    touch_profile(conn, &step.profile_id)?;
    Ok(())
}

fn touch_profile(conn: &Connection, profile_id: &str) -> Result<()> {
    conn.execute(
        "UPDATE profile SET updated_at = ?2 WHERE id = ?1",
        params![profile_id, now()],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations;

    fn memory() -> Connection {
        let conn = Connection::open_in_memory().expect("in-memory database");
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations::apply(&conn).unwrap();
        conn
    }

    #[test]
    fn a_profile_is_created_named_and_listed_in_order() {
        let conn = memory();
        let first = create_profile(&conn, "  Morning ").unwrap();
        let second = create_profile(&conn, "Study").unwrap();
        assert_eq!(first.name, "Morning", "the name is trimmed");
        assert!(!first.imported_unreviewed);
        let listed = list_profiles(&conn).unwrap();
        assert_eq!(
            listed.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(),
            [first.id.as_str(), second.id.as_str()]
        );
    }

    #[test]
    fn a_blank_name_is_refused() {
        let conn = memory();
        assert!(matches!(
            create_profile(&conn, "   "),
            Err(Error::InvalidInput(_))
        ));
    }

    #[test]
    fn steps_keep_their_order_and_go_with_the_profile() {
        let conn = memory();
        let profile = create_profile(&conn, "Morning").unwrap();
        let a = add_step(
            &conn,
            &profile.id,
            "app",
            r#"{"program":"a.exe","args":[]}"#,
        )
        .unwrap();
        let b = add_step(
            &conn,
            &profile.id,
            "app",
            r#"{"program":"b.exe","args":[]}"#,
        )
        .unwrap();
        assert!(a.position < b.position);

        delete_profile(&conn, &profile.id).unwrap();
        assert!(list_steps(&conn, &profile.id).unwrap().is_empty());
        assert!(matches!(get_step(&conn, &a.id), Err(Error::NotFound)));
    }

    #[test]
    fn a_step_that_is_not_json_or_not_a_known_kind_is_refused() {
        let conn = memory();
        let profile = create_profile(&conn, "Morning").unwrap();
        assert!(matches!(
            add_step(&conn, &profile.id, "app", "not json"),
            Err(Error::InvalidInput(_))
        ));
        assert!(matches!(
            add_step(&conn, &profile.id, "folder", "{}"),
            Err(Error::InvalidInput(_))
        ));
        assert!(matches!(
            add_step(&conn, "missing", "app", "{}"),
            Err(Error::NotFound)
        ));
    }
}

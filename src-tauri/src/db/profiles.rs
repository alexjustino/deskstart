//! Profiles and their steps: CRUD, nothing cleverer.

use rusqlite::{params, Connection, OptionalExtension};

use crate::db::models::{ImportStep, Profile, Step, STEP_KINDS};
use crate::db::{new_id, now};
use crate::error::{Error, Result};

const PROFILE_COLUMNS: &str = "id, name, position, imported_unreviewed, created_at, updated_at";
const STEP_COLUMNS: &str = "id, profile_id, position, kind, config_json, timing_json, \
     wait_json, place_json, reviewed, created_at, updated_at";

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
        wait_json: row.get(6)?,
        place_json: row.get(7)?,
        reviewed: row.get::<_, i64>(8)? != 0,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
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
///
/// A step written here is accepted the moment it is written: the person adding
/// it is the person who would have reviewed it (ADR-013).
pub fn add_step(
    conn: &Connection,
    profile_id: &str,
    kind: &str,
    config_json: &str,
    timing_json: &str,
    wait_json: &str,
    place_json: &str,
) -> Result<Step> {
    get_profile(conn, profile_id)?;
    if !STEP_KINDS.contains(&kind) {
        return Err(Error::InvalidInput("that kind of step does not exist"));
    }
    if serde_json::from_str::<serde_json::Value>(config_json).is_err() {
        return Err(Error::InvalidInput("the step configuration is not valid"));
    }
    if serde_json::from_str::<serde_json::Value>(timing_json).is_err() {
        return Err(Error::InvalidInput("the step timing is not valid"));
    }
    let position: i64 = conn.query_row(
        "SELECT coalesce(max(position), -1) + 1 FROM step WHERE profile_id = ?1",
        [profile_id],
        |r| r.get(0),
    )?;
    let id = new_id();
    let stamp = now();
    conn.execute(
        "INSERT INTO step (id, profile_id, position, kind, config_json, timing_json, wait_json,
                           place_json, reviewed, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, ?9, ?9)",
        params![
            id,
            profile_id,
            position,
            kind,
            config_json,
            timing_json,
            wait_json,
            place_json,
            stamp
        ],
    )?;
    touch_profile(conn, profile_id)?;
    get_step(conn, &id)
}

pub fn update_step(
    conn: &Connection,
    id: &str,
    config_json: &str,
    timing_json: &str,
    wait_json: &str,
    place_json: &str,
) -> Result<Step> {
    if serde_json::from_str::<serde_json::Value>(config_json).is_err() {
        return Err(Error::InvalidInput("the step configuration is not valid"));
    }
    if serde_json::from_str::<serde_json::Value>(timing_json).is_err() {
        return Err(Error::InvalidInput("the step timing is not valid"));
    }
    let changed = conn.execute(
        "UPDATE step SET config_json = ?2, timing_json = ?3, wait_json = ?4, place_json = ?5,
                        updated_at = ?6
         WHERE id = ?1",
        params![id, config_json, timing_json, wait_json, place_json, now()],
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
    // Removing a step is a way of reviewing it: a profile whose last
    // unaccepted step was deleted has nothing left to accept.
    clear_review_flag_if_done(conn, &step.profile_id)?;
    Ok(())
}

/// Store a profile that arrived in a file: unreviewed, and every step with it.
///
/// The steps arrive in order, each naming — by position — the earlier step it
/// waits for, because a file carries no identifiers. The identities are made
/// here, in one transaction, and only then does a wait get one. A position that
/// does not point strictly backwards is refused, the same rule the domain
/// applied to the document, enforced again on this side of the boundary.
pub fn import_profile(conn: &mut Connection, name: &str, steps: &[ImportStep]) -> Result<Profile> {
    let name = name.trim();
    if name.is_empty() {
        return Err(Error::InvalidInput("a profile needs a name"));
    }
    for (index, step) in steps.iter().enumerate() {
        if !STEP_KINDS.contains(&step.kind.as_str()) {
            return Err(Error::InvalidInput("that kind of step does not exist"));
        }
        for json in [
            &step.config_json,
            &step.timing_json,
            &step.wait_json,
            &step.place_json,
        ] {
            if serde_json::from_str::<serde_json::Value>(json).is_err() {
                return Err(Error::InvalidInput("the step could not be read"));
            }
        }
        match step.wait_on {
            None => {}
            Some(on) if on >= 1 && on <= index as i64 => {}
            Some(_) => {
                return Err(Error::InvalidInput(
                    "a step may only wait for an earlier step",
                ))
            }
        }
    }

    let ids: Vec<String> = steps.iter().map(|_| new_id()).collect();
    let profile_id = new_id();
    let stamp = now();
    let position: i64 = conn.query_row(
        "SELECT coalesce(max(position), -1) + 1 FROM profile",
        [],
        |r| r.get(0),
    )?;

    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO profile (id, name, position, imported_unreviewed, created_at, updated_at)
         VALUES (?1, ?2, ?3, 1, ?4, ?4)",
        params![profile_id, name, position, stamp],
    )?;
    for (index, step) in steps.iter().enumerate() {
        let wait_json = match step.wait_on {
            None => "{}".to_string(),
            Some(on) => {
                let mut wait: serde_json::Value = serde_json::from_str(&step.wait_json)
                    .map_err(|_| Error::InvalidInput("the step could not be read"))?;
                let object = wait
                    .as_object_mut()
                    .ok_or(Error::InvalidInput("the step could not be read"))?;
                object.insert(
                    "stepId".to_string(),
                    serde_json::Value::String(ids[(on - 1) as usize].clone()),
                );
                wait.to_string()
            }
        };
        tx.execute(
            "INSERT INTO step (id, profile_id, position, kind, config_json, timing_json, wait_json,
                               place_json, reviewed, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, ?9, ?9)",
            params![
                ids[index],
                profile_id,
                index as i64,
                step.kind,
                step.config_json,
                step.timing_json,
                wait_json,
                step.place_json,
                stamp
            ],
        )?;
    }
    tx.commit()?;
    get_profile(conn, &profile_id)
}

/// Accept one step. The profile's flag clears when no step is left unaccepted.
pub fn accept_step(conn: &Connection, id: &str) -> Result<Profile> {
    let step = get_step(conn, id)?;
    conn.execute(
        "UPDATE step SET reviewed = 1, updated_at = ?2 WHERE id = ?1",
        params![id, now()],
    )?;
    clear_review_flag_if_done(conn, &step.profile_id)?;
    get_profile(conn, &step.profile_id)
}

/// Accept every step of a profile at once. The screen says, in words, what this
/// does before it offers it.
pub fn accept_profile(conn: &Connection, profile_id: &str) -> Result<Profile> {
    get_profile(conn, profile_id)?;
    conn.execute(
        "UPDATE step SET reviewed = 1, updated_at = ?2 WHERE profile_id = ?1 AND reviewed = 0",
        params![profile_id, now()],
    )?;
    clear_review_flag_if_done(conn, profile_id)?;
    get_profile(conn, profile_id)
}

/// Clear the review flag when nothing is left to accept — and never set it:
/// the flag goes up at import and comes down here, once.
fn clear_review_flag_if_done(conn: &Connection, profile_id: &str) -> Result<()> {
    let remaining: i64 = conn.query_row(
        "SELECT count(*) FROM step WHERE profile_id = ?1 AND reviewed = 0",
        [profile_id],
        |r| r.get(0),
    )?;
    if remaining == 0 {
        conn.execute(
            "UPDATE profile SET imported_unreviewed = 0, updated_at = ?2 WHERE id = ?1",
            params![profile_id, now()],
        )?;
    }
    Ok(())
}

/// Swap a step with its neighbour above (`direction < 0`) or below. At the
/// edge nothing moves and nothing complains: the list is returned as it is.
pub fn move_step(conn: &mut Connection, id: &str, direction: i64) -> Result<Vec<Step>> {
    let step = get_step(conn, id)?;
    let steps = list_steps(conn, &step.profile_id)?;
    let index = steps
        .iter()
        .position(|s| s.id == id)
        .ok_or(Error::NotFound)?;
    let target = match direction.signum() {
        -1 if index > 0 => index - 1,
        1 if index + 1 < steps.len() => index + 1,
        _ => return Ok(steps),
    };
    // Positions are made dense first so a swap is exactly a swap, whatever
    // gaps deletions left behind.
    let tx = conn.transaction()?;
    for (position, s) in steps.iter().enumerate() {
        let position = if s.id == steps[index].id {
            target
        } else if s.id == steps[target].id {
            index
        } else {
            position
        };
        tx.execute(
            "UPDATE step SET position = ?2 WHERE id = ?1",
            params![s.id, position as i64],
        )?;
    }
    tx.execute(
        "UPDATE profile SET updated_at = ?2 WHERE id = ?1",
        params![step.profile_id, now()],
    )?;
    tx.commit()?;
    list_steps(conn, &step.profile_id)
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

    /// A step as it arrives from a file.
    fn arriving(program: &str, wait_on: Option<i64>) -> ImportStep {
        ImportStep {
            kind: "app".to_string(),
            config_json: format!(r#"{{"program":"{program}","args":[]}}"#),
            timing_json: "{}".to_string(),
            wait_on,
            wait_json: match wait_on {
                None => "{}".to_string(),
                Some(_) => r#"{"probe":{"kind":"window"},"timeoutMs":9000}"#.to_string(),
            },
            place_json: "{}".to_string(),
        }
    }

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
            "{}",
            "{}",
            "{}",
        )
        .unwrap();
        let b = add_step(
            &conn,
            &profile.id,
            "app",
            r#"{"program":"b.exe","args":[]}"#,
            "{}",
            "{}",
            "{}",
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
            add_step(&conn, &profile.id, "app", "not json", "{}", "{}", "{}"),
            Err(Error::InvalidInput(_))
        ));
        assert!(matches!(
            add_step(&conn, &profile.id, "shortcut", "{}", "{}", "{}", "{}"),
            Err(Error::InvalidInput(_))
        ));
        assert!(matches!(
            add_step(&conn, "missing", "app", "{}", "{}", "{}", "{}"),
            Err(Error::NotFound)
        ));
    }

    #[test]
    fn a_step_moves_one_place_and_stays_put_at_the_edge() {
        let mut conn = memory();
        let profile = create_profile(&conn, "Morning").unwrap();
        let a = add_step(
            &conn,
            &profile.id,
            "app",
            r#"{"program":"a.exe"}"#,
            "{}",
            "{}",
            "{}",
        )
        .unwrap();
        let b = add_step(
            &conn,
            &profile.id,
            "url",
            r#"{"url":"https://b"}"#,
            "{}",
            "{}",
            "{}",
        )
        .unwrap();
        let c = add_step(
            &conn,
            &profile.id,
            "folder",
            r#"{"path":"C:/c"}"#,
            "{}",
            "{}",
            "{}",
        )
        .unwrap();
        let order = |steps: &[Step]| steps.iter().map(|s| s.id.clone()).collect::<Vec<_>>();

        let moved = move_step(&mut conn, &c.id, -1).unwrap();
        assert_eq!(order(&moved), [a.id.clone(), c.id.clone(), b.id.clone()]);

        let edge = move_step(&mut conn, &a.id, -1).unwrap();
        assert_eq!(order(&edge), [a.id.clone(), c.id.clone(), b.id.clone()]);

        let down = move_step(&mut conn, &a.id, 1).unwrap();
        assert_eq!(order(&down), [c.id, a.id, b.id]);
        assert!(matches!(
            move_step(&mut conn, "missing", 1),
            Err(Error::NotFound)
        ));
    }

    #[test]
    fn an_imported_profile_arrives_unreviewed_with_every_step_unaccepted() {
        let mut conn = memory();
        let profile = import_profile(
            &mut conn,
            " Shared ",
            &[arriving("a.exe", None), arriving("b.exe", Some(1))],
        )
        .unwrap();
        assert_eq!(profile.name, "Shared");
        assert!(profile.imported_unreviewed);
        let steps = list_steps(&conn, &profile.id).unwrap();
        assert_eq!(steps.len(), 2);
        assert!(steps.iter().all(|s| !s.reviewed));
        // The wait arrived as a position and left as an identity.
        assert!(steps[1].wait_json.contains(&steps[0].id));
        assert!(!steps[0].wait_json.contains("stepId"));
    }

    #[test]
    fn a_wait_that_does_not_point_backwards_is_refused_here_too() {
        let mut conn = memory();
        for wait_on in [Some(0), Some(1), Some(2), Some(-1)] {
            assert!(
                matches!(
                    import_profile(&mut conn, "Shared", &[arriving("a.exe", wait_on)]),
                    Err(Error::InvalidInput(_))
                ),
                "a first step cannot wait for {wait_on:?}"
            );
        }
        // Nothing was left behind by a refusal.
        assert!(list_profiles(&conn).unwrap().is_empty());
    }

    #[test]
    fn a_step_that_could_not_be_read_takes_the_whole_import_with_it() {
        let mut conn = memory();
        let mut broken = arriving("b.exe", None);
        broken.config_json = "not json".to_string();
        assert!(matches!(
            import_profile(&mut conn, "Shared", &[arriving("a.exe", None), broken]),
            Err(Error::InvalidInput(_))
        ));
        assert!(list_profiles(&conn).unwrap().is_empty());
        assert!(matches!(
            import_profile(
                &mut conn,
                "Shared",
                &[ImportStep {
                    kind: "shortcut".to_string(),
                    ..arriving("a.exe", None)
                }]
            ),
            Err(Error::InvalidInput(_))
        ));
    }

    #[test]
    fn the_flag_clears_only_when_the_last_step_is_accepted() {
        let mut conn = memory();
        let profile = import_profile(
            &mut conn,
            "Shared",
            &[arriving("a.exe", None), arriving("b.exe", Some(1))],
        )
        .unwrap();
        let steps = list_steps(&conn, &profile.id).unwrap();

        let after_first = accept_step(&conn, &steps[0].id).unwrap();
        assert!(
            after_first.imported_unreviewed,
            "one step is not every step"
        );
        assert!(list_steps(&conn, &profile.id).unwrap()[0].reviewed);

        let after_second = accept_step(&conn, &steps[1].id).unwrap();
        assert!(!after_second.imported_unreviewed);
        // And it never goes back up.
        assert!(
            !accept_step(&conn, &steps[0].id)
                .unwrap()
                .imported_unreviewed
        );
    }

    #[test]
    fn accepting_the_whole_profile_accepts_every_step_at_once() {
        let mut conn = memory();
        let profile = import_profile(
            &mut conn,
            "Shared",
            &[arriving("a.exe", None), arriving("b.exe", Some(1))],
        )
        .unwrap();
        let accepted = accept_profile(&conn, &profile.id).unwrap();
        assert!(!accepted.imported_unreviewed);
        assert!(list_steps(&conn, &profile.id)
            .unwrap()
            .iter()
            .all(|s| s.reviewed));
    }

    #[test]
    fn deleting_the_last_unaccepted_step_is_a_way_of_accepting_the_rest() {
        let mut conn = memory();
        let profile = import_profile(
            &mut conn,
            "Shared",
            &[arriving("a.exe", None), arriving("b.exe", None)],
        )
        .unwrap();
        let steps = list_steps(&conn, &profile.id).unwrap();
        accept_step(&conn, &steps[0].id).unwrap();
        delete_step(&conn, &steps[1].id).unwrap();
        assert!(!get_profile(&conn, &profile.id).unwrap().imported_unreviewed);
    }

    #[test]
    fn a_step_written_here_is_accepted_the_moment_it_is_written() {
        let conn = memory();
        let profile = create_profile(&conn, "Morning").unwrap();
        let step = add_step(
            &conn,
            &profile.id,
            "app",
            r#"{"program":"a.exe","args":[]}"#,
            "{}",
            "{}",
            "{}",
        )
        .unwrap();
        assert!(step.reviewed);
    }

    #[test]
    fn a_step_keeps_where_its_window_goes() {
        let conn = memory();
        let profile = create_profile(&conn, "Morning").unwrap();
        let place = r#"{"monitor":2,"state":"maximized"}"#;
        let step = add_step(
            &conn,
            &profile.id,
            "app",
            r#"{"program":"a.exe","args":[]}"#,
            "{}",
            "{}",
            place,
        )
        .unwrap();
        assert_eq!(step.place_json, place);
        assert_eq!(get_step(&conn, &step.id).unwrap().place_json, place);

        // And an edit that says nothing about the window still says something:
        // the column is written every time, so "back to wherever it opens" is
        // a change the row can hold.
        let cleared = update_step(
            &conn,
            &step.id,
            r#"{"program":"a.exe","args":[]}"#,
            "{}",
            "{}",
            "{}",
        )
        .unwrap();
        assert_eq!(cleared.place_json, "{}");
    }
}

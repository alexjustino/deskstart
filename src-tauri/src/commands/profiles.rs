//! Profile and step commands: validate, delegate, return.
//!
//! F5 adds the file door and the review gate to this surface: a profile can be
//! written out as text, read back in as text, imported **unreviewed**, and then
//! accepted a step at a time. The two file commands are given a path the person
//! chose in the system's own dialog — this side never picks one, and never
//! looks anywhere it was not sent.

use std::path::PathBuf;

use tauri::State;

use crate::db::models::{ImportStep, Profile, Step};
use crate::db::{profiles, Db};
use crate::error::Result;
use crate::os::files;

#[tauri::command]
pub fn profiles_list(db: State<'_, Db>) -> Result<Vec<Profile>> {
    let conn = db.0.lock().expect("the database lock was poisoned");
    profiles::list_profiles(&conn)
}

#[tauri::command]
pub fn profile_create(db: State<'_, Db>, name: String) -> Result<Profile> {
    let conn = db.0.lock().expect("the database lock was poisoned");
    profiles::create_profile(&conn, &name)
}

#[tauri::command]
pub fn profile_rename(db: State<'_, Db>, id: String, name: String) -> Result<Profile> {
    let conn = db.0.lock().expect("the database lock was poisoned");
    profiles::rename_profile(&conn, &id, &name)
}

#[tauri::command]
pub fn profile_delete(db: State<'_, Db>, id: String) -> Result<()> {
    let conn = db.0.lock().expect("the database lock was poisoned");
    profiles::delete_profile(&conn, &id)
}

#[tauri::command]
pub fn steps_list(db: State<'_, Db>, profile_id: String) -> Result<Vec<Step>> {
    let conn = db.0.lock().expect("the database lock was poisoned");
    profiles::list_steps(&conn, &profile_id)
}

#[tauri::command]
pub fn step_add(
    db: State<'_, Db>,
    profile_id: String,
    kind: String,
    config_json: String,
    timing_json: Option<String>,
    wait_json: Option<String>,
    place_json: Option<String>,
) -> Result<Step> {
    let conn = db.0.lock().expect("the database lock was poisoned");
    profiles::add_step(
        &conn,
        &profile_id,
        &kind,
        &config_json,
        timing_json.as_deref().unwrap_or("{}"),
        wait_json.as_deref().unwrap_or("{}"),
        place_json.as_deref().unwrap_or("{}"),
    )
}

#[tauri::command]
pub fn step_update(
    db: State<'_, Db>,
    id: String,
    config_json: String,
    timing_json: Option<String>,
    wait_json: Option<String>,
    place_json: Option<String>,
) -> Result<Step> {
    let conn = db.0.lock().expect("the database lock was poisoned");
    profiles::update_step(
        &conn,
        &id,
        &config_json,
        timing_json.as_deref().unwrap_or("{}"),
        wait_json.as_deref().unwrap_or("{}"),
        place_json.as_deref().unwrap_or("{}"),
    )
}

#[tauri::command]
pub fn step_delete(db: State<'_, Db>, id: String) -> Result<()> {
    let conn = db.0.lock().expect("the database lock was poisoned");
    profiles::delete_step(&conn, &id)
}

/// Move a step one place up (`-1`) or down (`1`) within its profile.
#[tauri::command]
pub fn step_move(db: State<'_, Db>, id: String, direction: i64) -> Result<Vec<Step>> {
    let mut conn = db.0.lock().expect("the database lock was poisoned");
    profiles::move_step(&mut conn, &id, direction)
}

/// Store a profile that came from a file. It is stored **unreviewed**: the host
/// refuses to run it until every step has been accepted (ADR-013).
#[tauri::command]
pub fn profile_import(db: State<'_, Db>, name: String, steps: Vec<ImportStep>) -> Result<Profile> {
    let mut conn = db.0.lock().expect("the database lock was poisoned");
    profiles::import_profile(&mut conn, &name, &steps)
}

/// Accept one step of an imported profile.
#[tauri::command]
pub fn step_accept(db: State<'_, Db>, id: String) -> Result<Profile> {
    let conn = db.0.lock().expect("the database lock was poisoned");
    profiles::accept_step(&conn, &id)
}

/// Accept every step of an imported profile at once.
#[tauri::command]
pub fn profile_accept(db: State<'_, Db>, id: String) -> Result<Profile> {
    let conn = db.0.lock().expect("the database lock was poisoned");
    profiles::accept_profile(&conn, &id)
}

/// Read a profile file as text. What it means is the domain's business.
#[tauri::command]
pub fn profile_file_read(path: String) -> Result<String> {
    files::read_text(&PathBuf::from(path))
}

/// Write a profile file. The path is the one the person chose.
#[tauri::command]
pub fn profile_file_write(path: String, contents: String) -> Result<()> {
    files::write_text(&PathBuf::from(path), &contents)
}

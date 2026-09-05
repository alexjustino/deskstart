//! Profile and step commands: validate, delegate, return.

use tauri::State;

use crate::db::models::{Profile, Step};
use crate::db::{profiles, Db};
use crate::error::Result;

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
) -> Result<Step> {
    let conn = db.0.lock().expect("the database lock was poisoned");
    profiles::add_step(&conn, &profile_id, &kind, &config_json)
}

#[tauri::command]
pub fn step_update(db: State<'_, Db>, id: String, config_json: String) -> Result<Step> {
    let conn = db.0.lock().expect("the database lock was poisoned");
    profiles::update_step(&conn, &id, &config_json)
}

#[tauri::command]
pub fn step_delete(db: State<'_, Db>, id: String) -> Result<()> {
    let conn = db.0.lock().expect("the database lock was poisoned");
    profiles::delete_step(&conn, &id)
}

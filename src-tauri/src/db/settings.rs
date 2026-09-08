//! Settings: a key/value store, and nothing cleverer (F10).
//!
//! The host keeps strings. What a key means, and what a value that this build
//! does not recognise falls back to, is the domain's (`domain/settings`). An
//! absent key is the default, so there is no default row to seed and no row to
//! delete when a setting goes back to its default.

use std::collections::BTreeMap;

use rusqlite::{params, Connection};

use crate::error::Result;

/// Every setting, key to value. The interface reads the whole map at start.
pub fn all(conn: &Connection) -> Result<BTreeMap<String, String>> {
    let mut statement = conn.prepare("SELECT key, value FROM setting")?;
    let rows = statement.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
    Ok(rows.collect::<rusqlite::Result<BTreeMap<_, _>>>()?)
}

/// Store one setting, replacing what was there.
pub fn set(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO setting (key, value) VALUES (?1, ?2)
         ON CONFLICT (key) DO UPDATE SET value = ?2",
        params![key, value],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations;

    fn memory() -> Connection {
        let conn = Connection::open_in_memory().expect("in-memory database");
        migrations::apply(&conn).unwrap();
        conn
    }

    #[test]
    fn a_setting_is_stored_read_and_replaced() {
        let conn = memory();
        assert!(all(&conn).unwrap().is_empty(), "no setting is the default");
        set(&conn, "theme", "dark").unwrap();
        assert_eq!(
            all(&conn).unwrap().get("theme").map(String::as_str),
            Some("dark")
        );
        set(&conn, "theme", "light").unwrap();
        assert_eq!(
            all(&conn).unwrap().get("theme").map(String::as_str),
            Some("light")
        );
        assert_eq!(all(&conn).unwrap().len(), 1);
    }
}

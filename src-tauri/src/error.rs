//! The single error type that crosses the command boundary.
//!
//! Everything the frontend can see is serialised as `{ "kind": ..., "message": ... }`.
//! Internal detail (paths, SQL, OS codes) is logged, never returned — a message
//! that reaches the UI is written for a person.
//!
//! A step that could not be started is **not** an error: it is an event in the
//! run log (`failed`, with a reason), because a profile continues past it and
//! the log is where what happened is recorded (ADR-011).

use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("the workspace database could not be opened or written")]
    Database(#[from] rusqlite::Error),

    #[error("the application data directory is not available")]
    DataDir,

    #[error("that no longer exists")]
    NotFound,

    #[error("this profile was imported and has not been reviewed; it cannot run yet")]
    Unreviewed,

    #[error("{0}")]
    InvalidInput(&'static str),
}

/// What the frontend receives. `kind` is stable and machine-readable; `message`
/// is the human sentence.
#[derive(Serialize)]
pub struct SerializedError {
    kind: &'static str,
    message: String,
}

impl Serialize for Error {
    // `Result` in this module is the crate alias, so the trait signature has to
    // spell out the standard one.
    fn serialize<S: serde::Serializer>(
        &self,
        serializer: S,
    ) -> std::result::Result<S::Ok, S::Error> {
        let kind = match self {
            Error::Database(_) => "database",
            Error::DataDir => "data_dir",
            Error::NotFound => "not_found",
            Error::Unreviewed => "unreviewed",
            Error::InvalidInput(_) => "invalid_input",
        };
        // The detail goes to the log; the frontend gets the sentence.
        log::error!("{kind}: {self:?}");
        SerializedError {
            kind,
            message: self.to_string(),
        }
        .serialize(serializer)
    }
}

pub type Result<T> = std::result::Result<T, Error>;

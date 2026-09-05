//! The shapes that cross the command boundary.
//!
//! These mirror the schema, not the interface: the frontend translates
//! snake_case into its own vocabulary once, in `src/data/`, rather than letting
//! the database's naming leak into every component.

use serde::{Deserialize, Serialize};

/// A named, ordered list of steps.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub position: i64,
    /// The review gate (ADR-013). While true the host refuses to run it.
    pub imported_unreviewed: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// One thing a profile opens, and how.
///
/// `config_json` is the domain's shape (ADR-010), stored verbatim. The host
/// parses it into [`AppStepConfig`] only at the moment of acting on it.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Step {
    pub id: String,
    pub profile_id: String,
    pub position: i64,
    pub kind: String,
    pub config_json: String,
    pub timing_json: String,
    pub created_at: String,
    pub updated_at: String,
}

/// The configuration of an `app` step, as the domain writes it.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AppStepConfig {
    pub program: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub working_dir: Option<String>,
}

/// One execution of a profile, real or dry.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Run {
    pub id: String,
    pub profile_id: Option<String>,
    pub profile_name: String,
    pub mode: String,
    pub trigger: String,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub outcome: Option<String>,
}

/// One line of the run log. Insert-only (ADR-011).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Event {
    pub id: i64,
    pub run_id: String,
    pub seq: i64,
    pub at: String,
    pub step_id: Option<String>,
    pub kind: String,
    pub payload_json: String,
}

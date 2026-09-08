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
/// never acts on it directly: the domain resolves it into a [`Launch`] and the
/// host re-checks that against the disk.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Step {
    pub id: String,
    pub profile_id: String,
    pub position: i64,
    pub kind: String,
    pub config_json: String,
    pub timing_json: String,
    /// What the step waits for before it starts (F4); `{}` is "nothing".
    pub wait_json: String,
    /// Where its window goes once it is open (F6); `{}` is "wherever it opens".
    pub place_json: String,
    /// Seen and accepted on this machine (ADR-013). Only import writes false.
    pub reviewed: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// A step as it arrives in a file: read and judged by the domain, and not yet
/// anything on this machine.
///
/// `wait_on` is the **position** of an earlier step in this same list, because
/// a file carries no identifiers (F5). The host creates the identities and then
/// puts them into `wait_json`, which arrives without one.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportStep {
    pub kind: String,
    pub config_json: String,
    pub timing_json: String,
    pub wait_on: Option<i64>,
    pub wait_json: String,
    pub place_json: String,
}

/// The step kinds the host knows how to act on. The schema's CHECK says the
/// same, and migration 007 is where the two were last made to agree.
pub const STEP_KINDS: [&str; 8] = [
    "app",
    "folder",
    "file",
    "url",
    "bookmarks",
    "terminal",
    "editor",
    "vm",
];

/// What the domain asks the host to do for one step: every path already
/// resolved and absolute. `source` is the path as written when expansion
/// changed it, so the log can show both.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Launch {
    #[serde(rename_all = "camelCase")]
    App {
        program: String,
        #[serde(default)]
        args: Vec<String>,
        #[serde(default)]
        working_dir: Option<String>,
        #[serde(default)]
        source: Option<String>,
    },
    Folder {
        path: String,
        #[serde(default)]
        source: Option<String>,
    },
    File {
        path: String,
        #[serde(default)]
        source: Option<String>,
    },
    Url {
        url: String,
        #[serde(default)]
        source: Option<String>,
    },
    /// A tool the host knows where to find (F7, ADR-022): an id from a closed
    /// list and an argument vector. The path is never in the profile.
    Tool {
        tool: String,
        #[serde(default)]
        args: Vec<String>,
        /// What this is, in the log: "Windows Terminal", "3 pages from Work".
        #[serde(default)]
        what: String,
        #[serde(default)]
        source: Option<String>,
    },
    /// A bookmark folder that has not been read yet.
    ///
    /// The host is never asked to open one of these: the loop reads the
    /// browser's file, the domain finds the folder in it, and what arrives
    /// here is a `Tool` launch with the addresses. This variant exists so a
    /// step that never ran can still be named — by `run_stop`, for instance —
    /// and `step_execute` refuses it rather than guessing.
    Bookmarks {
        browser: String,
        folder: String,
        #[serde(default)]
        source: Option<String>,
    },
}

impl Launch {
    pub fn kind(&self) -> &'static str {
        match self {
            Launch::App { .. } => "app",
            Launch::Folder { .. } => "folder",
            Launch::File { .. } => "file",
            Launch::Url { .. } => "url",
            // A tool launch belongs to the step kind that made it: the browser
            // ones can only have come from a bookmark folder.
            Launch::Tool { tool, .. } => match tool.as_str() {
                "terminal" => "terminal",
                "editor" => "editor",
                "hyperv" | "virtualbox" | "vmware" => "vm",
                _ => "bookmarks",
            },
            Launch::Bookmarks { .. } => "bookmarks",
        }
    }

    /// The launch as the log records it — what was asked, before the outcome.
    pub fn describe(&self) -> serde_json::Value {
        match self {
            Launch::App {
                program,
                args,
                working_dir,
                source,
            } => serde_json::json!({
                "kind": "app",
                "program": program,
                "args": args,
                "workingDir": working_dir,
                "source": source,
            }),
            Launch::Folder { path, source } | Launch::File { path, source } => {
                serde_json::json!({ "kind": self.kind(), "target": path, "source": source })
            }
            Launch::Url { url, source } => {
                serde_json::json!({ "kind": "url", "target": url, "source": source })
            }
            Launch::Tool {
                tool,
                args,
                what,
                source,
            } => serde_json::json!({
                "kind": self.kind(),
                "tool": tool,
                "target": what,
                "args": args,
                "source": source,
            }),
            Launch::Bookmarks {
                browser,
                folder,
                source,
            } => serde_json::json!({
                "kind": "bookmarks",
                "tool": browser,
                "target": folder,
                "source": source,
            }),
        }
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_launch_reads_from_the_domain_shape() {
        let app: Launch = serde_json::from_str(
            r#"{"kind":"app","program":"C:\\a.exe","args":["x"],"workingDir":null,"source":"%SYSTEMROOT%\\a.exe"}"#,
        )
        .unwrap();
        assert_eq!(app.kind(), "app");
        assert_eq!(app.describe()["source"], "%SYSTEMROOT%\\a.exe");

        let url: Launch = serde_json::from_str(r#"{"kind":"url","url":"https://x.y/"}"#).unwrap();
        assert_eq!(url.describe()["target"], "https://x.y/");
        assert!(url.describe()["source"].is_null());

        let unknown: Result<Launch, _> = serde_json::from_str(r#"{"kind":"shortcut","path":"x"}"#);
        assert!(unknown.is_err());
    }
}
